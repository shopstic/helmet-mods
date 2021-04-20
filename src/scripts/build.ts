import { CliProgram, createCliAction, ExitCode } from "../deps/cli_utils.ts";
import { captureExec, inheritExec } from "../deps/exec_utils.ts";
import { basename, joinPath } from "../deps/std_path.ts";
import { Type } from "../deps/typebox.ts";
import { expandGlobSync, fsExists } from "../deps/std_fs.ts";
import { cyan, gray } from "../deps/std_fmt_colors.ts";
import { createHash } from "../deps/std_hash.ts";

function NonEmptyString(options: Parameters<typeof Type.String>[0] = {}) {
  return Type.String({ minLength: 1, ...options });
}

enum BuildImageOutput {
  DevNull = "dev_null",
  Registry = "registry",
}

const outputArgumentType = Type.Enum(BuildImageOutput, {
  description:
    "Output to either /dev/null (for testing) or push to remote registry",
});

async function buildImage(
  { buildContext, registryRepo, imageName, tag, output }: {
    buildContext: string;
    registryRepo: string;
    imageName: string;
    tag: string;
    output: BuildImageOutput;
  },
) {
  const tags: string[] = typeof tag === "string" ? [tag] : tag;

  const cacheTag = "__buildkit_cache__";

  const imageRef = `${registryRepo}/${imageName}`;
  const taggedImageRefs = tags.map((tag) => `${imageRef}:${tag}`);

  console.error("Build context", buildContext);

  const outputArgs = (output == BuildImageOutput.DevNull)
    ? [
      "--output",
      "type=tar,dest=/dev/null",
      "--import-cache",
      `type=registry,ref=${imageRef}:${cacheTag}`,
    ]
    : [
      "--output",
      `type=image,"name=${taggedImageRefs.join(",")}",push=true`,
      "--export-cache",
      `type=registry,ref=${imageRef}:${cacheTag},mode=max`,
      "--import-cache",
      `type=registry,ref=${imageRef}:${cacheTag}`,
    ];

  await inheritExec({
    run: {
      cmd: [
        "buildctl",
        "build",
        "--frontend",
        "dockerfile.v0",
        "--local",
        `context=${buildContext}`,
        "--local",
        `dockerfile=${buildContext}`,
        "--opt",
        `build-arg:BUILD_VERSION=${tags[0]}`,
        ...outputArgs,
      ],
    },
    stderrTag: gray(`[$ buildctl ${imageRef}]`),
    stdoutTag: gray(`[$ buildctl ${imageRef}]`),
  });
}

async function deepHash(path: string): Promise<string> {
  const permHashPromise = captureExec({
    run: {
      cmd: ["bash", "-euo", "pipefail"],
      cwd: path,
    },
    stdin:
      `find . -type f -print0 | xargs -0 xargs stat --printf "%n %A\\n" | sort | sha1sum | awk '{print $1}'`,
  });

  const contentHashPromise = captureExec({
    run: {
      cmd: ["bash", "-euo", "pipefail"],
      cwd: path,
    },
    stdin:
      `find . -type f -print0 | xargs -0 sha1sum | awk '{print $1}' | sort | sha1sum | awk '{print $1}'`,
  });

  const hashes = (await Promise.all([permHashPromise, contentHashPromise]));

  return createHash("sha1")
    .update(hashes.map((h) => h.trim()).join(""))
    .toString();
}

const buildApps = createCliAction(
  Type.Object({
    registryRepo: NonEmptyString({
      description: "Container registry repository reference",
      examples: ["docker.io/shopstic"],
    }),
    version: NonEmptyString({
      description: "Release version",
      examples: ["1.2.3"],
    }),
    output: outputArgumentType,
  }),
  async ({ registryRepo, output, version }) => {
    const appPaths = Array
      .from(expandGlobSync("./src/apps/*"))
      .filter((e) => e.isDirectory)
      .map((e) => e.path);

    const promises = appPaths.map((appPath) =>
      (async () => {
        const appName = basename(appPath);
        const appBuildPath = joinPath(appPath, "build");
        const appEntrypoint = joinPath(appPath, `${appName}.ts`);
        const metaPath = joinPath(appPath, "meta.ts");
        const meta = await import(metaPath);
        const { imageName } = meta;

        if (await fsExists(appEntrypoint)) {
          console.error("Building app", cyan(appEntrypoint));
          await inheritExec({
            run: {
              cmd: ["bash"],
            },
            stdin: `deno bundle "${appEntrypoint}" > ${
              joinPath(appBuildPath, `${appName}.js`)
            }`,
            stderrTag: gray(`[$ deno bundle ${appName}.ts]`),
            stdoutTag: gray(`[$ deno bundle ${appName}.ts]`),
          });
        }

        const appBuildHash = await deepHash(appBuildPath);

        if (output === BuildImageOutput.Registry) {
          const imageRef = `${registryRepo}/${imageName}:${appBuildHash}`;

          const manifestExists = await (async () => {
            try {
              await inheritExec({
                run: {
                  cmd: [
                    "docker",
                    "manifest",
                    "inspect",
                    imageRef,
                  ],
                },
                ignoreStderr: true,
                ignoreStdout: true,
              });
              return true;
            } catch {
              return false;
            }
          })();

          if (!manifestExists) {
            console.log(`${imageRef} doesn't exist, going to build`);
            await buildImage({
              buildContext: appBuildPath,
              registryRepo,
              imageName,
              tag: appBuildHash,
              output,
            });
          } else {
            console.log(`${imageRef} already exists`);
          }

          await Deno.writeTextFile(
            metaPath,
            `export const version = ${
              JSON.stringify(appBuildHash)
            };\nexport const imageName = ${JSON.stringify(imageName)};\n`,
          );
        } else {
          await buildImage({
            buildContext: appBuildPath,
            registryRepo,
            imageName,
            tag: appBuildHash,
            output,
          });
        }
      })()
    );

    await Promise.all(promises);

    await Deno.writeTextFile(
      "./src/version.ts",
      `export const version = ${JSON.stringify(version)};\n`,
    );

    return ExitCode.Zero;
  },
);

await new CliProgram()
  .addAction("build-apps", buildApps)
  .run(Deno.args);
