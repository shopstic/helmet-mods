import { dirname, fromFileUrl, joinPath } from "../../../deps/std_path.ts";
import { memoizePromise } from "../../../deps/async_utils.ts";
import { createK8sConfigMap } from "../../../deps/helmet.ts";

export const readFdbServerEntrypointScriptContent = memoizePromise(async () =>
  await Deno.readTextFile(
    joinPath(
      dirname(fromFileUrl(import.meta.url)),
      "entrypoints",
      "fdb-server.sh",
    ),
  )
);

export async function createFdbEntrypointConfigMap(
  { name, fileName }: { name: string; fileName: string },
) {
  return createK8sConfigMap({
    metadata: {
      name: name,
    },
    data: {
      [fileName]: await readFdbServerEntrypointScriptContent(),
    },
  });
}
