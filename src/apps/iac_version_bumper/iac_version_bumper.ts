import { captureExec, inheritExec } from "../../deps/exec_utils.ts";
import { fsExists } from "../../deps/std_fs.ts";
import { joinPath } from "../../deps/std_path.ts";
import { CliProgram, createCliAction } from "../../deps/cli_utils.ts";
import { validate } from "../../deps/validation_utils.ts";
import { readAll } from "../../deps/std_io.ts";
import { loggerWithContext } from "../../libs/logger.ts";
import {
  VersionBumpParamsSchema,
  VersionBumpTargets,
  VersionBumpTargetsSchema,
} from "./libs/types.ts";

const logger = loggerWithContext("main");

export async function autoBumpVersions(
  { repoPath, gitBranch, targets }: {
    repoPath: string;
    gitBranch: string;
    targets: VersionBumpTargets;
  },
) {
  const gitPullCmd = ["git", "pull", "--rebase", "origin", gitBranch];

  await inheritExec({ run: { cmd: gitPullCmd, cwd: repoPath } });

  const promises = targets
    .map(async ({ name, versionFilePath, image }) => {
      const fullVersionFilePath = joinPath(repoPath, versionFilePath);

      const currentDigest = await (async () => {
        if (await fsExists(fullVersionFilePath)) {
          const currentDigestSource = await Deno.readTextFile(
            joinPath(repoPath, versionFilePath),
          );

          return JSON.parse(
            currentDigestSource.match(/^export default ([^;]+)/)![1],
          );
        } else {
          return "";
        }
      })();

      logger.info("Fetching digest for", image);

      const digest = (await captureExec({
        run: {
          cmd: [
            "skopeo",
            "inspect",
            "--format",
            "{{.Digest}}",
            `docker://${image}`,
          ],
        },
      })).trim();

      logger.info(
        `Got digest for ${image}: ${digest} vs. ${currentDigest || "unknown"}`,
      );

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
        await Deno.writeTextFile(
          joinPath(repoPath, versionFilePath),
          `export default ${JSON.stringify(digest)};\n`,
        );
      }),
  );

  const gitStatus = await captureExec(
    { run: { cmd: ["git", "status"], cwd: repoPath } },
  );

  if (!gitStatus.includes("nothing to commit, working tree clean")) {
    logger.info("Needs to commit, git status:", gitStatus);

    await inheritExec({ run: { cmd: ["git", "add", "*"], cwd: repoPath } });

    const changedNames = changes.map((c) => c!.name);

    await inheritExec(
      {
        run: {
          cmd: [
            "git",
            "commit",
            "-m",
            `Bump version${changedNames.length > 1 ? "s" : ""} for ${
              changedNames.join(", ")
            }`,
          ],
          cwd: repoPath,
        },
      },
    );
    await inheritExec(
      {
        run: {
          cmd: ["git", "push", "origin", gitBranch],
          cwd: repoPath,
        },
      },
    );
  } else {
    logger.info("Nothing to commit");
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

await new CliProgram()
  .addAction(
    "auto-bump-versions",
    createCliAction(
      VersionBumpParamsSchema,
      async (
        { gitBranch, gitRepoUri, targetsConfigFile, checkIntervalSeconds },
      ) => {
        const repoPath = await Deno.makeTempDir();
        const gitCloneCmd = ["git", "clone", gitRepoUri, repoPath];

        await inheritExec({ run: { cmd: gitCloneCmd } });

        while (true) {
          logger.error(
            `Reading targets config from: ${
              targetsConfigFile === "-" ? "stdin" : targetsConfigFile
            }`,
          );

          const targetsConfigHandle = targetsConfigFile === "-"
            ? Deno.stdin
            : await Deno.open(
              targetsConfigFile,
              { read: true, write: false },
            );

          const targetsConfigRaw = JSON.parse(new TextDecoder().decode(
            await readAll(targetsConfigHandle),
          ));

          const targetsConfigResult = validate(
            VersionBumpTargetsSchema,
            targetsConfigRaw,
          );

          if (!targetsConfigResult.isSuccess) {
            throw new Error(
              `Failed validating targets config. Payload:\n${
                JSON.stringify(targetsConfigRaw, null, 2)
              }\nErrors:\n${JSON.stringify(targetsConfigResult, null, 2)}`,
            );
          }

          const targets = targetsConfigResult.value;

          await autoBumpVersions({ repoPath, gitBranch, targets });
          await delay(checkIntervalSeconds * 1000);
        }
      },
    ),
  )
  .run(Deno.args);