import { CliProgram, createCliAction, ExitCode } from "../deps/cli_utils.ts";
import { inheritExec } from "../deps/exec_utils.ts";
import { basename, joinPath } from "../deps/std_path.ts";
import { Type } from "../deps/typebox.ts";
import { expandGlobSync, fsExists } from "../deps/std_fs.ts";
import { cyan, gray } from "../deps/std_fmt_colors.ts";

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

const buildImage = createCliAction(
  Type.Object({
    buildContext: NonEmptyString({
      description:
        "Path to the buildImage context directory. Dockerfile must be present inside that directory",
      examples: ["/path/to/buildImage"],
    }),
    registryRepo: NonEmptyString({
      description: "Container registry repository reference",
      examples: ["docker.io/shopstic"],
    }),
    imageName: NonEmptyString({
      description: "Container image name",
      examples: ["my-app"],
    }),
    tag: Type.Union([Type.Array(NonEmptyString()), NonEmptyString()], {
      description: "Tag(s) to push, repeat for multiple tags",
      examples: ["v1.2.3"],
    }),
    output: outputArgumentType,
  }),
  async ({ buildContext, registryRepo, imageName, tag, output }) => {
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
        `type=registry,ref=${imageRef}:${cacheTag}`,
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

    return ExitCode.Zero;
  },
);

const buildApps = createCliAction(
  Type.Object({
    registryRepo: NonEmptyString({
      description: "Container registry repository reference",
      examples: ["docker.io/shopstic"],
    }),
    gitRef: NonEmptyString({
      description: "Current git tag or commit SHA",
    }),
    output: outputArgumentType,
  }),
  async ({ registryRepo, gitRef, output }) => {
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
        const { version, imageName } = meta;

        const tag = (version === "latest") ? gitRef : version;

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

        const exitCode = await buildImage.action({
          buildContext: appBuildPath,
          registryRepo,
          imageName,
          tag,
          output,
        });

        await Deno.writeTextFile(
          metaPath,
          `export const version = ${
            JSON.stringify(tag)
          };\nexport const imageName = ${JSON.stringify(imageName)};\n`,
        );

        return exitCode;
      })()
    );

    const codes = await Promise.all(promises);

    return new ExitCode(codes.reduce((max, c) => Math.max(max, c.code), 0));
  },
);

await new CliProgram()
  .addAction("build-apps", buildApps)
  .addAction("build-image", buildImage)
  .run(Deno.args);
