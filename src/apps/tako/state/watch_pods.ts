import { assertUnreachable } from "@wok/utils/assertion";
import type { K8s } from "@wok/k8s-api";
import type { TakoK8sClient } from "../lib/controller.ts";
import { k8sControllerWatch, takoManagedLabelSelector } from "../lib/controller.ts";

type ManagedPodMap = Map<string, K8s["core.v1.Pod"]>;

export async function* takoWatchManagedPods(
  { client, signal }: { client: TakoK8sClient; signal: AbortSignal },
): AsyncGenerator<ManagedPodMap> {
  let initialListEnded = false;
  const map: ManagedPodMap = new Map();

  const events = k8sControllerWatch(
    client.endpoint("/api/v1/pods").method("get"),
  )({
    query: {
      timeoutSeconds: 30,
      labelSelector: takoManagedLabelSelector,
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
