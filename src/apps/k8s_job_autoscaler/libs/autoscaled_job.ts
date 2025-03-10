import { delay } from "$deps/async_utils.ts";
import type { K8s } from "@wok/k8s-utils";
import { deepEqual } from "$deps/std_testing.ts";
import { k8sControllerWatch } from "@wok/k8s-utils/controller";
import type { Logger } from "$libs/logger.ts";
import { createPromApiClient } from "$libs/prom_api_client.ts";
import type { AutoscaledJob, AutoscaledJobAutoscaling } from "./schemas.ts";
import type { Paths } from "./types.ts";
import type { OpenapiClient } from "$deps/k8s_openapi.ts";
import { assertUnreachable } from "@wok/utils/assertion";
export const jobReplicaIndexLabel = "autoscaledjob.shopstic.com/index";

export interface MetricSnapshot {
  pending: number;
  inProgress: number | null;
}

export async function* watchMetric(
  {
    autoscaling: { query, extraRequestParams, pendingMetric = {}, inProgressMetric, intervalSeconds, metricServerUrl },
    signal,
    logger,
  }: {
    autoscaling: AutoscaledJobAutoscaling;
    signal: AbortSignal;
    logger: Logger;
  },
): AsyncGenerator<MetricSnapshot> {
  const promClient = createPromApiClient(metricServerUrl);
  let last = performance.now();
  const maxDelayMs = intervalSeconds * 1000;

  while (!signal.aborted) {
    try {
      const metrics = await promClient.vectorQuery({
        query,
        extraParams: extraRequestParams,
      }, {
        signal,
      });

      const pendingValue = metrics.find((m) => deepEqual(m.metric, pendingMetric))?.value[1];
      const inProgressValue = inProgressMetric
        ? metrics.find((m) => deepEqual(m.metric, inProgressMetric))?.value[1]
        : null;

      logger.info({ pendingValue, inProgressValue, query });

      yield {
        pending: pendingValue ? Number(pendingValue) : 0,
        inProgress: inProgressMetric ? (inProgressValue ? Number(inProgressValue) : 0) : null,
      };
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "AbortError") {
        logger.error({ msg: "Metric query failed", error });
      }
    } finally {
      const now = performance.now();
      const elapseMs = now - last;

      const toDelayMs = Math.max(maxDelayMs - elapseMs, 0);
      if (toDelayMs > 0) {
        await delay(toDelayMs, { signal });
      }
      last = performance.now();
    }
  }
}

export async function getJobs(
  { client, namespace }: {
    client: OpenapiClient<Paths>;
    namespace: string;
  },
): Promise<Array<K8s["batch.v1.Job"]>> {
  const jobList = (await client.endpoint("/apis/batch/v1/namespaces/{namespace}/jobs").method("get")({
    path: {
      namespace,
    },
    query: {
      labelSelector: jobReplicaIndexLabel,
    },
  })).data;

  return jobList.items;
}

export async function* watchJobs(
  { client, signal, namespace }: {
    client: OpenapiClient<Paths>;
    signal: AbortSignal;
    namespace: string;
  },
) {
  const events = k8sControllerWatch(
    client.endpoint("/apis/batch/v1/namespaces/{namespace}/jobs").method("get"),
  )({
    path: {
      namespace,
    },
    query: {
      timeoutSeconds: 30,
      labelSelector: jobReplicaIndexLabel,
    },
  }, {
    signal,
  });

  for await (const event of events) {
    if (event.type === "ADDED" || event.type === "BOOKMARK") {
      // Ignore
    } else if (event.type === "MODIFIED") {
      if (
        event.object.status?.conditions?.find((c) =>
          (c.type === "Complete" && c.status === "True") || (c.type === "Failed" && c.status === "True")
        )
      ) {
        yield event;
      }
    } else if (event.type === "DELETED") {
      yield event;
    } else if (event.type === "INITIAL_LIST_END") {
      // Ignore
    } else {
      assertUnreachable(event.type);
    }
  }
}

export async function* watchJobGroups(
  { client, signal, namespace }: { client: OpenapiClient<Paths>; signal: AbortSignal; namespace: string },
): AsyncGenerator<Map<string, AutoscaledJob>> {
  const map: Map<string, AutoscaledJob> = new Map();

  const events = k8sControllerWatch(
    client.endpoint("/apis/shopstic.com/v1/namespaces/{namespace}/autoscaledjobs").method("get"),
  )({
    path: {
      namespace,
    },
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
    } else if (event.type === "BOOKMARK" || event.type === "INITIAL_LIST_END") {
      // Ignore
    } else {
      assertUnreachable(event.type);
    }

    yield map;
  }
}
