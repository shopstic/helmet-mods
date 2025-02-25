import { deepMerge } from "$deps/helmet.ts";
import type {
  K8sApiExtractListItemType,
  K8sApiWatchEvent,
  OpenapiOperationApi,
  OpenapiOperationApiArgType,
  OpenapiOperationApiReturnType,
} from "$deps/k8s_openapi.ts";
import { TextLineStream } from "$deps/std_stream.ts";

export function k8sControllerStream<
  // deno-lint-ignore no-explicit-any
  Func extends OpenapiOperationApi<any>,
  Item extends K8sApiExtractListItemType<OpenapiOperationApiReturnType<Func>>,
  Args extends OpenapiOperationApiArgType<Func>,
>(
  api: Func,
): (
  args: Args,
  init: RequestInit,
) => AsyncGenerator<K8sApiWatchEvent<Item>> {
  async function* doWatch(args: Args, init: RequestInit) {
    try {
      const initialList = await api(args, init);
      // deno-lint-ignore no-explicit-any
      const data = initialList.data as any;
      let lastResourceVersion = data.metadata.resourceVersion;

      for (const initialItem of data.items) {
        yield {
          type: "ADDED",
          object: initialItem,
        } as K8sApiWatchEvent<Item>;
      }

      while (!init.signal || !init.signal.aborted) {
        for await (
          const line of (await api.stream(
            deepMerge(structuredClone(args), {
              query: {
                allowWatchBookmarks: true,
                watch: true,
                ...(lastResourceVersion ? { resourceVersion: lastResourceVersion } : {}),
              },
            } as Args),
            init,
          )).data!.pipeThrough(new TextDecoderStream()).pipeThrough(new TextLineStream())
        ) {
          const event: K8sApiWatchEvent<Item> = JSON.parse(line);
          yield event;
          // deno-lint-ignore no-explicit-any
          lastResourceVersion = (event.object as any).metadata.resourceVersion;
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException) || e.name !== "AbortError") {
        throw e;
      }
    }
  }

  return doWatch;
}
