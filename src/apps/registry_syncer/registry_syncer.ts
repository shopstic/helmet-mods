import { captureExec, ExecAbortedError, inheritExec, NonZeroExitError } from "../../deps/exec_utils.ts";
import { loggerWithContext } from "../../libs/logger.ts";
import { RegistrySyncJob, RegistrySyncJobs, RegistrySyncJobsSchema, RegistrySyncParamsSchema } from "./libs/types.ts";
import { commandWithTimeout, withAbortSignal } from "../../libs/utils.ts";
import { CliProgram, createCliAction, ExitCode } from "../../deps/cli_utils.ts";
import { readAll } from "../../deps/std_stream.ts";
import { validate } from "../../deps/validation_utils.ts";
import {
  catchError,
  concatMap,
  EMPTY,
  exhaustMap,
  interval,
  lastValueFrom,
  merge,
  of,
  startWith,
  switchMap,
  switchScan,
  tap,
  throwError,
} from "../../deps/rxjs.ts";
import { equal } from "../../deps/std_testing.ts";

function getElapsedSeconds(startTime: number) {
  return Math.round((performance.now() - startTime) * 100) / 100000;
}

export async function sync(
  {
    lastDigest,
    job: {
      name,
      fromImage,
      toImage,
      tag,
      platform,
    },
    abortSignal,
  }: {
    lastDigest: string | null;
    job: RegistrySyncJob;
    abortSignal?: AbortSignal;
  },
) {
  const logger = loggerWithContext(`sync-${name}`);

  const getManifestDigestCmdArgs = (platform === "all") ? ["--list", "--require-list"] : ["--platform", platform];
  const fromRef = `${fromImage}:${tag}`;
  const toRef = `${toImage}:${tag}`;

  logger.info(`Fetching manifest digest for '${fromRef}' with platform '${platform}'`);
  const digest = await (async () => {
    try {
      const ret = (await captureExec({
        cmd: commandWithTimeout(
          ["regctl", "manifest", "digest", ...getManifestDigestCmdArgs, `${fromRef}`],
          5,
        ),
        abortSignal,
      })).out.trim();

      if (!ret.startsWith("sha256:")) {
        throw new Error(`Invalid digest for '${fromRef}'. Got: ${ret}`);
      }

      return ret;
    } catch (e) {
      if (e instanceof NonZeroExitError) {
        logger.error(`Command failed: ${e.command.join(" ")}`);
        logger.error(`stdout: ${e.output?.out.trim()}`);
        logger.error(`stderr: ${e.output?.err.trim()}`);
        return null;
      }

      throw e;
    }
  })();

  if (!digest) {
    return lastDigest;
  }

  if (digest !== lastDigest) {
    logger.info(`Digest changed from '${lastDigest ?? "<first-sync>"}' to '${digest}', going to sync to '${toRef}'`);

    const startTime = performance.now();
    const timer = setInterval(() => {
      logger.info(`Still syncing digest '${digest}' to '${toRef}', elapsed: ${getElapsedSeconds(startTime)}s`);
    }, 5000);

    try {
      await inheritExec({
        cmd: commandWithTimeout(
          ["regctl", "image", "copy", "--digest-tags", "--force-recursive", fromRef, toRef],
          360,
        ),
        abortSignal,
      });
    } finally {
      clearInterval(timer);
    }

    logger.info(`Completed sync to '${toRef}' in ${getElapsedSeconds(startTime)}s`);
    return digest;
  } else {
    logger.info("Digest hasn't changed, nothing to do");
    return lastDigest;
  }
}

async function loadConfig(configFile: string): Promise<RegistrySyncJobs> {
  const logger = loggerWithContext("config");

  logger.info(`Reading jobs config from '${configFile}'`);

  const jobsConfigHandle = await Deno.open(configFile, { read: true, write: false });

  const jobsConfigRaw = JSON.parse(new TextDecoder().decode(
    await readAll(jobsConfigHandle),
  ));

  const jobsConfigResult = validate(
    RegistrySyncJobsSchema,
    jobsConfigRaw,
  );

  if (!jobsConfigResult.isSuccess) {
    throw new Error(
      `Failed validating jobs config. Payload:\n${JSON.stringify(jobsConfigRaw, null, 2)}\nErrors:\n${
        JSON.stringify(jobsConfigResult, null, 2)
      }`,
    );
  }

  return jobsConfigResult.value;
}

await new CliProgram()
  .addAction(
    "run",
    createCliAction(
      RegistrySyncParamsSchema,
      (
        {
          configFile,
          digestCheckIntervalSeconds,
          configCheckIntervalSeconds,
        },
      ) => {
        const logger = loggerWithContext("main");

        const seedConfig: RegistrySyncJobs | null = null;

        const stream = interval(configCheckIntervalSeconds * 1000)
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
            switchMap((jobs) => {
              if (jobs.length === 0) {
                logger.info(`Config is empty, nothing to do`);
                return EMPTY;
              }

              logger.info(`Using config with jobs: ${jobs.map(({ name }) => name).join(", ")}`);

              return withAbortSignal((abortSignal) =>
                merge.apply(
                  null,
                  jobs
                    .map((job) => {
                      let lastDigest: string | null = null;
                      return interval(digestCheckIntervalSeconds * 1000)
                        .pipe(
                          startWith(-1),
                          exhaustMap(() => {
                            return sync({ lastDigest, job, abortSignal });
                          }),
                          catchError((e) => {
                            return (e instanceof ExecAbortedError) ? EMPTY : throwError(() => e);
                          }),
                          tap((digest) => {
                            lastDigest = digest;
                          }),
                        );
                    }),
                )
              );
            }),
            catchError((e) => {
              if (e instanceof NonZeroExitError) {
                logger.error(`Command failed: ${e.command.join(" ")}`);
                logger.error(`stdout: ${e.output?.out.trim()}`);
                logger.error(`stderr: ${e.output?.err.trim()}`);
              }
              return throwError(() => e);
            }),
          );

        return lastValueFrom(stream).then(() => ExitCode.One);
      },
    ),
  )
  .run(Deno.args);
