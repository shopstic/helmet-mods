import { captureExec, ExecAbortedError, NonZeroExitError } from "../../deps/exec_utils.ts";
import { loggerWithContext } from "../../libs/logger.ts";
import { commandWithTimeout, NonEmptyString, withAbortSignal } from "../../libs/utils.ts";
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

function exhaustiveMatchingGuard(_: never): never {
  throw new Error("Non exhaustive matching");
}

interface AuthResult {
  auth: string;
  registry: string;
}

export function authenticate(auth: RegistryAuth): Observable<AuthResult> {
  const logger = loggerWithContext("auth");

  if (auth.type === "static") {
    const { registry, username, password } = auth;
    logger.info(`Authenticating to '${registry}' with username and password`);

    return of({ registry, auth: btoa(`${username}:${password}`) });
  } else if (auth.type === "ecr") {
    const { registry, region, refreshIntervalSeconds } = auth;

    return withAbortSignal((abortSignal) =>
      interval(refreshIntervalSeconds * 1000)
        .pipe(
          startWith(-1),
          exhaustMap(async () => {
            logger.info(`Authenticating to '${registry}' with AWS CLI`);
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
  const logger = loggerWithContext("config");

  logger.info(`Reading config from '${configFile}'`);

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
      ({ configFile, outputFile, configLoadIntervalSeconds }) => {
        const logger = loggerWithContext("main");

        const seedConfig: RegistryAuthConfig | null = null;

        const stream = interval(configLoadIntervalSeconds * 1000)
          .pipe(
            startWith(-1),
            concatMap(() => loadConfig(configFile)),
            switchScan((previous, next) => {
              if (equal(previous, next)) {
                logger.info("Config hasn't changed");
                return EMPTY;
              }
              return of(next);
            }, seedConfig),
            switchMap((auths) => {
              if (auths.length === 0) {
                logger.info("Config is empty, nothing to do");
                return EMPTY;
              }

              logger.info(`Using config with registries: ${auths.map(({ registry }) => registry).join(", ")}`);

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
                logger.error(`Command failed: ${e.command.join(" ")}`);
                logger.error(`stdout: ${e.output?.out}`);
                logger.error(`stderr: ${e.output?.err}`);
              }
              return throwError(() => e);
            }),
            tap(() => logger.info(`Updated ${outputFile}`)),
          );

        return lastValueFrom(stream).then(() => ExitCode.Zero);
      },
    ),
  )
  .run(Deno.args);
