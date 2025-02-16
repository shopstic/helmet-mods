import { captureExec, ExecAbortedError, inheritExec, NonZeroExitError } from "$deps/exec_utils.ts";
import type { RegistrySyncJob, RegistrySyncJobs } from "./libs/schemas.ts";
import { RegistrySyncJobsSchema, RegistrySyncParamsSchema } from "./libs/schemas.ts";
import { commandWithTimeout } from "$libs/utils.ts";
import { CliProgram, createCliAction, ExitCode } from "$deps/cli_utils.ts";
import {
  catchError,
  concatMap,
  EMPTY,
  exhaustMap,
  fromEvent,
  interval,
  lastValueFrom,
  merge,
  of,
  startWith,
  switchMap,
  switchScan,
  takeUntil,
  tap,
  throwError,
} from "$deps/rxjs.ts";
import { deepEqual } from "$deps/std_testing.ts";
import { Logger } from "$libs/logger.ts";
import { validate } from "$deps/schema.ts";
import { withAbortSignal } from "$libs/rxjs_utils.ts";

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
  const logger = new Logger({ ctx: `sync-${name}` });

  const getManifestDigestCmdArgs = (platform === "all") ? ["--list", "--require-list"] : ["--platform", platform];
  const fromRef = `${fromImage}:${tag}`;
  const toRef = `${toImage}:${tag}`;

  logger.info({
    msg: "Fetching manifest digest",
    fromRef,
    platform,
  });
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
        logger.error({
          msg: "Command failed",
          error: e,
        });
        return null;
      }

      throw e;
    }
  })();

  if (!digest) {
    return lastDigest;
  }

  if (digest !== lastDigest) {
    logger.info({
      msg: "Digest changed, going to sync",
      lastDigest: lastDigest ?? "<first-sync>",
      digest,
      toRef,
    });

    const startTime = performance.now();
    const timer = setInterval(() => {
      logger.info({
        msg: "Still syncing",
        digest,
        toRef,
        elapsedSeconds: getElapsedSeconds(startTime),
      });
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

    logger.info({
      msg: "Completed sync",
      toRef,
      elapsedSeconds: getElapsedSeconds(startTime),
    });
    return digest;
  } else {
    logger.info({
      msg: "Digest hasn't changed, nothing to do",
    });
    return lastDigest;
  }
}

async function loadConfig(configFile: string): Promise<RegistrySyncJobs> {
  const logger = new Logger({ ctx: "config" });

  logger.info({
    msg: "Reading jobs config",
    configFile,
  });

  const jobsConfigRaw = JSON.parse(await Deno.readTextFile(configFile));

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
        abortSignal,
      ) => {
        const logger = new Logger({ ctx: "main" });

        const seedConfig: RegistrySyncJobs | null = null;

        const stream = interval(configCheckIntervalSeconds * 1000)
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
            switchMap((jobs) => {
              if (jobs.length === 0) {
                logger.info({ msg: "Config is empty, nothing to do" });
                return EMPTY;
              }

              logger.info({
                msg: "Using config with jobs",
                jobs: jobs.map(({ name }) => name),
              });

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
                logger.error({ msg: "Command failed", error: e });
              }
              return throwError(() => e);
            }),
            takeUntil(fromEvent(abortSignal, "abort")),
          );

        return lastValueFrom(stream).then(() => ExitCode.One);
      },
    ),
  )
  .run(Deno.args);
