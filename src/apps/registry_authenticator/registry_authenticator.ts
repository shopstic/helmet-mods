import { captureExec, ExecAbortedError, NonZeroExitError } from "../../deps/exec_utils.ts";
import { commandWithTimeout, exhaustiveMatchingGuard, NonEmptyString, withAbortSignal } from "../../libs/utils.ts";
import { CliProgram, createCliAction, ExitCode } from "../../deps/cli_utils.ts";
import { readAll } from "../../deps/std_stream.ts";
import { validate } from "../../deps/validation_utils.ts";
import { RegistryAuth, RegistryAuthConfig, RegistryAuthConfigSchema } from "./libs/types.ts";
import { Type } from "../../deps/typebox.ts";
import {
  catchError,
  combineLatest,
  concatMap,
  EMPTY,
  exhaustMap,
  interval,
  lastValueFrom,
  map,
  Observable,
  of,
  startWith,
  switchMap,
  switchScan,
  tap,
  throwError,
} from "../../deps/rxjs.ts";
import { equal } from "../../deps/std_testing.ts";
import { dirname, resolvePath } from "../../deps/std_path.ts";
import { Logger } from "../../libs/logger.ts";

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

  const configHandle = await Deno.open(configFile, { read: true, write: false });

  const configRaw = JSON.parse(new TextDecoder().decode(
    await readAll(configHandle),
  ));

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

await new CliProgram()
  .addAction(
    "run",
    createCliAction(
      Type.Object({
        configFile: NonEmptyString,
        outputFile: NonEmptyString,
        configLoadIntervalSeconds: Type.Number({ minimum: 1 }),
      }),
      async ({ configFile, outputFile, configLoadIntervalSeconds }) => {
        const logger = new Logger({ ctx: "main" });

        const seedConfig: RegistryAuthConfig | null = null;

        const resolvedOutputFile = resolvePath(outputFile);

        try {
          await Deno.mkdir(dirname(resolvedOutputFile), { recursive: true });
        } catch {
          // Ignore
        }

        const stream = interval(configLoadIntervalSeconds * 1000)
          .pipe(
            startWith(-1),
            concatMap(() => loadConfig(configFile)),
            switchScan((previous, next) => {
              if (equal(previous, next)) {
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
            concatMap((auths) => Deno.writeTextFile(outputFile, JSON.stringify({ auths }, null, 2))),
            catchError((e) => {
              if (e instanceof NonZeroExitError) {
                logger.error({ msg: "Command failed", error: e });
              }
              return throwError(() => e);
            }),
            tap(() => logger.info({ msg: "Updated output file", outputFile })),
          );

        await lastValueFrom(stream);

        return ExitCode.One;
      },
    ),
  )
  .run(Deno.args);
