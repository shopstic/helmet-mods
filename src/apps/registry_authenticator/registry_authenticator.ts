import { captureExec, ExecAbortedError, inheritExec, NonZeroExitError } from "../../deps/exec_utils.ts";
import { commandWithTimeout, exhaustiveMatchingGuard, withAbortSignal } from "../../libs/utils.ts";
import { CliProgram, createCliAction, ExitCode } from "../../deps/cli_utils.ts";
import { validate } from "../../deps/validation_utils.ts";
import type { RegistryAuth, RegistryAuthConfig} from "./libs/types.ts";
import { RegistryAuthConfigSchema, RegistryAuthParamsSchema } from "./libs/types.ts";
import type {
  Observable} from "../../deps/rxjs.ts";
import {
  catchError,
  combineLatest,
  concatMap,
  EMPTY,
  exhaustMap,
  fromEvent,
  interval,
  lastValueFrom,
  map,
  of,
  startWith,
  switchMap,
  switchScan,
  takeUntil,
  tap,
  throwError,
} from "../../deps/rxjs.ts";
import { deepEqual } from "../../deps/std_testing.ts";
import { Logger } from "../../libs/logger.ts";
import { createK8sSecret } from "../../deps/helmet.ts";

interface AuthResult {
  auth: string;
  registry: string;
}

export function authenticate(auth: RegistryAuth): Observable<AuthResult> {
  const logger = new Logger({ ctx: "auth" });

  if (auth.type === "static") {
    const { registry, username, password } = auth;
    logger.info({
      msg: "Authenticating with username and password",
      registry,
    });

    return of({ registry, auth: btoa(`${username}:${password}`) });
  } else if (auth.type === "ecr") {
    const { registry, region, refreshIntervalSeconds } = auth;

    return withAbortSignal((abortSignal) =>
      interval(refreshIntervalSeconds * 1000)
        .pipe(
          startWith(-1),
          exhaustMap(async () => {
            logger.info({
              msg: "Authenticating with AWS CLI",
              registry,
            });
            const token = (await captureExec({
              cmd: commandWithTimeout(["aws", "ecr", "get-login-password", "--region", region], 5),
              abortSignal,
            })).out;
            return { registry, auth: btoa(`AWS:${token}`) };
          }),
          catchError((e) => {
            return (e instanceof ExecAbortedError) ? EMPTY : throwError(() => e);
          }),
        )
    );
  }

  return exhaustiveMatchingGuard(auth);
}

async function loadConfig(configFile: string): Promise<RegistryAuthConfig> {
  const logger = new Logger({ ctx: "config" });

  logger.info({
    msg: "Reading config",
    configFile,
  });

  const configRaw = JSON.parse(await Deno.readTextFile(configFile));
  const configResult = validate(RegistryAuthConfigSchema, configRaw);

  if (!configResult.isSuccess) {
    throw new Error(
      `Failed validating config. Payload:\n${JSON.stringify(configRaw, null, 2)}\nErrors:\n${
        JSON.stringify(configResult, null, 2)
      }`,
    );
  }

  return configResult.value;
}

async function writeSecret({ namespace, name, data }: { namespace: string; name: string; data: unknown }) {
  const secret = createK8sSecret({
    metadata: {
      name,
      namespace,
    },
    type: "kubernetes.io/dockerconfigjson",
    data: {
      ".dockerconfigjson": btoa(
        JSON.stringify(data),
      ),
    },
  });

  await inheritExec({
    cmd: commandWithTimeout([
      "kubectl",
      "apply",
      "-f",
      "-",
    ], 5),
    stdin: {
      pipe: JSON.stringify(secret),
    },
  });
}

await new CliProgram()
  .addAction(
    "run",
    createCliAction(
      RegistryAuthParamsSchema,
      async ({ configFile, outputSecretNamespace, outputSecretName, configLoadIntervalSeconds }, _, abortSignal) => {
        const outputNamespace = outputSecretNamespace ?? await Deno.readTextFile(
          "/var/run/secrets/kubernetes.io/serviceaccount/namespace",
        );
        const logger = new Logger({ ctx: "main" });

        const seedConfig: RegistryAuthConfig | null = null;

        const stream = interval(configLoadIntervalSeconds * 1000)
          .pipe(
            startWith(-1),
            concatMap(() => loadConfig(configFile)),
            switchScan((previous, next) => {
              if (deepEqual(previous, next)) {
                logger.info({ msg: "Config hasn't changed" });
                return EMPTY;
              }
              return of(next);
            }, seedConfig),
            switchMap((auths) => {
              if (auths.length === 0) {
                logger.info({ msg: "Config is empty, nothing to do" });
                return EMPTY;
              }

              logger.info({
                msg: "Using config with registries",
                registries: auths.map(({ registry }) => registry),
              });

              return combineLatest(auths.map((auth) => authenticate(auth)))
                .pipe(
                  map((results) =>
                    Object.fromEntries(results.map((r) => [r.registry, {
                      auth: r.auth,
                    }]))
                  ),
                );
            }),
            concatMap((auths) => writeSecret({ name: outputSecretName, namespace: outputNamespace, data: { auths } })),
            catchError((e) => {
              if (e instanceof NonZeroExitError) {
                logger.error({ msg: "Command failed", error: e });
              }
              return throwError(() => e);
            }),
            tap(() => logger.info({ msg: "Updated secret", name: outputSecretName, namespace: outputNamespace })),
            takeUntil(fromEvent(abortSignal, "abort")),
          );

        await lastValueFrom(stream);

        return ExitCode.One;
      },
    ),
  )
  .run(Deno.args);
