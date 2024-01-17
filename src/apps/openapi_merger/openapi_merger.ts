import { CliProgram, createCliAction, ExitCode } from "../../deps/cli_utils.ts";
import { OpenapiMergerConfigCheck, OpenapiMergerParamsSchema } from "./libs/types.ts";
import { Logger } from "../../libs/logger.ts";
import { serveDir } from "../../deps/std_http.ts";
import { stripMargin } from "../../libs/utils.ts";
import { openapiMerge, OpenapiMergeInput, openapiMergeIsErrorResult } from "../../deps/openapi_merge.ts";
import { yamlParse, yamlStringify } from "../../deps/std_yaml.ts";
import { deepMerge } from "../../deps/helmet.ts";
import { immerProduce } from "../../deps/immer.ts";

export class BackendRequestError extends Error {
  readonly name = BackendRequestError.name;
  constructor(readonly url: string, readonly response: Response) {
    super(`A request to a backend at url=${url} failed with status=${response.status} ${response.statusText}`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function stripAllOperationSecurity<T>(swagger: T): T {
  // deno-lint-ignore no-explicit-any
  return immerProduce(swagger, (draft: any) => {
    for (const path of Object.values(draft.paths)) {
      // deno-lint-ignore no-explicit-any
      for (const operation of Object.values(path as any)) {
        // deno-lint-ignore no-explicit-any
        delete (operation as any).security;
      }
    }
  });
}

await new CliProgram()
  .addAction(
    "run",
    createCliAction(
      OpenapiMergerParamsSchema,
      async (
        {
          configFile,
          staticRoot,
          serverInterface,
          serverPort,
          docsPath,
        },
        _,
        abortSignal,
      ) => {
        const logger = new Logger();

        if (!docsPath.startsWith("/")) {
          logger.error({ msg: "docsPath must start with /" });
          return ExitCode.One;
        }

        if (docsPath.endsWith("/")) {
          logger.error({ msg: "docsPath must not end with /" });
          return ExitCode.One;
        }

        const configJson = await (async () => {
          try {
            return JSON.parse(await Deno.readTextFile(configFile));
          } catch (error) {
            logger.error({ msg: `Failed reading JSON config file at ${configFile}`, error });
            throw error;
          }
        })();

        if (!OpenapiMergerConfigCheck.Check(configJson)) {
          logger.error({
            msg: "Failed validating config",
            errors: Array.from(OpenapiMergerConfigCheck.Errors(configJson)),
          });
          return ExitCode.One;
        }

        const config = OpenapiMergerConfigCheck.Decode(configJson);

        async function mergeSpecs(abortSignal: AbortSignal) {
          const docs = await Promise.all(config.sources.map(async ({ url }) => {
            const res = await fetch(url, { signal: abortSignal });

            if (!res.ok) {
              throw new BackendRequestError(url, res);
            }

            if (url.endsWith(".yaml") || url.endsWith(".yml")) {
              // deno-lint-ignore no-explicit-any
              return yamlParse(await res.text()) as any;
            } else {
              return await res.json();
            }
          }));

          const mergeInput: OpenapiMergeInput = config.sources.map((source, i) => ({
            oas: docs[i],
            ...source.merge,
          }));

          return openapiMerge(mergeInput);
        }

        const indexHtml = stripMargin`<!DOCTYPE html>
          |<html lang="en">
          |  <head>
          |    <meta charset="UTF-8">
          |    <title>Swagger UI</title>
          |    <link rel="stylesheet" type="text/css" href="swagger-ui.css" />
          |    <link rel="stylesheet" type="text/css" href="index.css" />
          |    <link rel="icon" type="image/png" href="favicon-32x32.png" sizes="32x32" />
          |    <link rel="icon" type="image/png" href="favicon-16x16.png" sizes="16x16" />
          |  </head>
          |
          |  <body>
          |    <div id="swagger-ui"></div>
          |    <script src="swagger-ui-bundle.js" charset="UTF-8"></script>
          |    <script src="swagger-ui-standalone-preset.js" charset="UTF-8"></script>
          |    <script>
          |    window.onload = function() {
          |      window.ui = SwaggerUIBundle({
          |        url: "docs.yaml",
          |        dom_id: '#swagger-ui',
          |        deepLinking: true,
          |        presets: [
          |          SwaggerUIBundle.presets.apis,
          |          SwaggerUIStandalonePreset
          |        ],
          |        plugins: [
          |          SwaggerUIBundle.plugins.DownloadUrl
          |        ],
          |        layout: "StandaloneLayout"
          |      });
          |    };
          |    </script>
          |  </body>
          |</html>`;

        logger.info({ msg: "Starting server", serverInterface, serverPort });

        const docsFileRegex = new RegExp(`^${docsPath}/docs\.(yaml|yml|json)$`);
        const docsPathWithSlash = `${docsPath}/`;

        await Deno.serve({
          port: serverPort,
          signal: abortSignal,
          onListen({ hostname, port }) {
            logger.info({ msg: `Server is up at http://${hostname}:${port}`, hostname, port });
          },
        }, async (request) => {
          const url = new URL(request.url);
          const { pathname } = url;

          if (pathname === "/healthz") {
            return new Response("OK");
          }

          if (docsFileRegex.test(pathname)) {
            try {
              const mergeResult = await mergeSpecs(request.signal);

              if (openapiMergeIsErrorResult(mergeResult)) {
                logger.error({ msg: "Failed merging", mergeResult });
                return new Response("Internal Server Error", { status: 500 });
              }

              let mergeOutput = mergeResult.output;

              if (config.stripAllOperationSecurity) {
                mergeOutput = stripAllOperationSecurity(mergeOutput);
              }

              if (typeof config.overrides === "object") {
                // deno-lint-ignore no-explicit-any
                mergeOutput = deepMerge(mergeResult.output as unknown as any, config.overrides);
              }

              if (pathname.endsWith(".json")) {
                return Response.json(mergeOutput);
              } else {
                // The JSON parse -> stringify dance is to strip out fields with undefined values
                // Otherwise yamlStringify will fail
                return new Response(yamlStringify(JSON.parse(JSON.stringify(mergeOutput))), {
                  headers: {
                    "content-type": "text/yaml",
                  },
                });
              }
            } catch (error) {
              logger.error({ msg: "Failed merging OpenAPI specs", error });
              return new Response("Internal Server Error", { status: 500 });
            }
          }

          if (pathname === docsPath) {
            const redirectUrl = new URL(url);
            redirectUrl.pathname = docsPathWithSlash;
            return Response.redirect(redirectUrl);
          }

          if (pathname === docsPathWithSlash) {
            return new Response(indexHtml, {
              headers: {
                "content-type": "text/html",
              },
            });
          }

          if (pathname.startsWith(docsPathWithSlash)) {
            return serveDir(request, {
              fsRoot: staticRoot,
              urlRoot: docsPath.replace(/^\//, ""),
              quiet: true,
            });
          }

          return new Response("Not Found", { status: 404 });
        }).finished;

        return ExitCode.Zero;
      },
    ),
  )
  .run(Deno.args);
