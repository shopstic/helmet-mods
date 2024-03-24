import { captureExec, inheritExec, NonZeroExitError } from "../../deps/exec_utils.ts";
import { dirname, joinPath } from "../../deps/std_path.ts";
import { CliProgram, createCliAction, ExitCode } from "../../deps/cli_utils.ts";
import { validate } from "../../deps/validation_utils.ts";
import { VersionBumpParamsSchema, VersionBumpTargets, VersionBumpTargetsSchema } from "./libs/types.ts";
import { commandWithTimeout } from "../../libs/utils.ts";
import { delay } from "../../deps/async_utils.ts";
import { Logger } from "../../libs/logger.ts";

async function updateDigests({ repoPath, targets }: {
  repoPath: string;
  targets: VersionBumpTargets;
}) {
  const promises = targets
    .map(async ({ name, versionFilePath, image, platform }) => {
      const logger = new Logger({ ctx: name });
      const fullVersionFilePath = joinPath(repoPath, versionFilePath);
      const getManifestDigestCmdArgs = (platform === "all") ? ["--list", "--require-list"] : ["--platform", platform];

      const currentDigest = await (async () => {
        try {
          const currentDigestSource = await Deno.readTextFile(
            fullVersionFilePath,
          );

          return JSON.parse(currentDigestSource.match(/^export default ([^;]+)/)![1]);
        } catch {
          return "";
        }
      })();

      logger.info({ msg: `Fetching manifest digest for '${image}' with platform '${platform}'` });

      const digest = await (async () => {
        try {
          const ret = (await captureExec({
            cmd: commandWithTimeout(
              ["regctl", "manifest", "digest", ...getManifestDigestCmdArgs, `${image}`],
              5,
            ),
          })).out.trim();

          if (!ret.startsWith("sha256:")) {
            throw new Error(`Invalid digest for '${image}'. Got: ${ret}`);
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
        return null;
      }

      logger.info({
        msg: "Got digest",
        image,
        digest,
        currentDigest: currentDigest ?? "unknown",
      });

      if (digest !== currentDigest) {
        return {
          versionFilePath,
          name,
          image,
          digest,
        };
      } else {
        return null;
      }
    });

  const changes = (await Promise.all(promises)).filter((c) => c !== null);

  await Promise.all(
    changes
      .map(async (change) => {
        const { versionFilePath, digest } = change!;
        const toWritePath = joinPath(repoPath, versionFilePath);

        await Deno.mkdir(dirname(toWritePath), { recursive: true });

        await Deno.writeTextFile(toWritePath, `export default ${JSON.stringify(digest)};\n`);
      }),
  );

  return changes;
}

export async function autoBumpVersions(
  { repoPath, gitBranch, targets, groupingDelayMs }: {
    repoPath: string;
    gitBranch: string;
    targets: VersionBumpTargets;
    groupingDelayMs: number;
  },
) {
  const logger = new Logger({ ctx: "bump" });

  const gitPullCmd = ["git", "pull", "--rebase", "origin", gitBranch];

  await inheritExec({ cmd: gitPullCmd, cwd: repoPath });

  const changes = await updateDigests({ repoPath, targets });

  if (changes.length > 0) {
    logger.info(
      {
        message:
          `Got ${changes.length} changes so far, going to check once more after ${groupingDelayMs}ms to group more changes`,
      },
    );
    await delay(groupingDelayMs);
    changes.push.apply(changes, await updateDigests({ repoPath, targets }));
  }

  const gitStatus = (await captureExec(
    { cmd: commandWithTimeout(["git", "status"], 5), cwd: repoPath },
  )).out;

  if (!gitStatus.includes("nothing to commit, working tree clean")) {
    logger.info({
      msg: "Need to commit",
      gitStatus,
    });

    await inheritExec({ cmd: commandWithTimeout(["git", "add", "*"], 5), cwd: repoPath });

    const changedNames = changes.map((c) => c!.name);

    await inheritExec({
      cmd: commandWithTimeout([
        "git",
        "commit",
        "-m",
        `Bump version${changedNames.length > 1 ? "s" : ""} for ${changedNames.join(", ")}`,
      ], 5),
      cwd: repoPath,
    });
    await inheritExec({
      cmd: commandWithTimeout(["git", "push", "origin", gitBranch], 10),
      cwd: repoPath,
    });
  } else {
    logger.info({ msg: "Nothing to commit" });
  }
}

await new CliProgram()
  .addAction(
    "auto-bump-versions",
    createCliAction(
      VersionBumpParamsSchema,
      async (
        {
          gitBranch,
          gitRepoUri,
          targetsConfigFile,
          checkIntervalSeconds,
          groupingDelaySeconds,
        },
        _,
        abortSignal,
      ) => {
        const logger = new Logger({ ctx: "main" });

        const repoPath = await Deno.makeTempDir();

        await inheritExec({ cmd: commandWithTimeout(["git", "clone", gitRepoUri, repoPath], 5) });

        while (!abortSignal.aborted) {
          logger.info({
            msg: "Reading targets config",
            targetsConfigFile,
          });

          const targetsConfigRaw = JSON.parse(await Deno.readTextFile(targetsConfigFile));

          const targetsConfigResult = validate(
            VersionBumpTargetsSchema,
            targetsConfigRaw,
          );

          if (!targetsConfigResult.isSuccess) {
            throw new Error(
              `Failed validating targets config. Payload:\n${JSON.stringify(targetsConfigRaw, null, 2)}\nErrors:\n${
                JSON.stringify(targetsConfigResult, null, 2)
              }`,
            );
          }

          const targets = targetsConfigResult.value;

          await autoBumpVersions({
            repoPath,
            gitBranch,
            targets,
            groupingDelayMs: groupingDelaySeconds * 1000,
          });

          await delay(checkIntervalSeconds * 1000, {
            signal: abortSignal,
          });
        }

        return ExitCode.One;
      },
    ),
  )
  .run(Deno.args);
