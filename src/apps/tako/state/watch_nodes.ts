import { assertUnreachable } from "@wok/utils/assertion";
import type { TakoWarmEc2Node } from "../crd.ts";
import type { TakoK8sClient } from "../lib/controller.ts";
import { k8sControllerWatch } from "@wok/k8s-utils/controller";

type WarmEc2NodeMap = Map<string, TakoWarmEc2Node>;

export async function* takoWatchWarmEc2Nodes(
  { client, signal }: { client: TakoK8sClient; signal: AbortSignal },
): AsyncGenerator<WarmEc2NodeMap> {
  let initialListEnded = false;

  const map: WarmEc2NodeMap = new Map();

  const events = k8sControllerWatch(
    client.endpoint("/apis/wok.run/v1/warmec2nodes").method("get"),
  )({
    query: {
      timeoutSeconds: 30,
    },
  }, {
    signal,
  });

  for await (const event of events) {
    if (event.type === "ADDED" || event.type === "MODIFIED") {
      map.set(event.object.metadata!.uid!, event.object);
    } else if (event.type === "DELETED") {
      map.delete(event.object.metadata!.uid!);
    } else if (event.type === "BOOKMARK") {
      // Ignore
    } else if (event.type === "INITIAL_LIST_END") {
      initialListEnded = true;
    } else {
      assertUnreachable(event.type);
    }

    if (initialListEnded) {
      yield map;
    }
  }
}
