import { delay } from "../../../deps/async_utils.ts";
import { K8s, k8sApiWatch, OpenapiClient } from "../../../deps/k8s_openapi.ts";
import { Logger2 } from "../../../libs/logger.ts";
import { createPromApiClient } from "../../../libs/prom_api_client.ts";
import { exhaustiveMatchingGuard } from "../../../libs/utils.ts";
import { AutoscaledJob, AutoscaledJobAutoscaling, Paths } from "./types.ts";

export const jobReplicaIndexLabel = "autoscaledjob.shopstic.com/index";

export async function* watchMetric(
  { autoscaling: { query, intervalSeconds, metricServerUrl }, signal, logger }: {
    autoscaling: AutoscaledJobAutoscaling;
    signal: AbortSignal;
    logger: Logger2;
  },
) {
  const promClient = createPromApiClient(metricServerUrl);
  let last = performance.now();
  const maxDelayMs = intervalSeconds * 1000;

  while (!signal.aborted) {
    try {
      const metrics = await promClient.vectorQuery({
        query,
      }, {
        signal,
      });

      if (metrics.length === 0) {
        logger.error({ error: "Query resulted in no metrics" });
      } else if (metrics.length !== 1) {
        logger.error({ error: "Query resulted in more than 1 metrics", metrics });
      } else {
        const metric = metrics[0];
        logger.info({ metric });

        const value = Number(metric.value[1]);
        yield value;
      }

      const now = performance.now();
      const elapseMs = now - last;

      const toDelayMs = Math.max(maxDelayMs - elapseMs, 0);
      if (toDelayMs > 0) {
        await delay(toDelayMs);
      }
      last = performance.now();
    } catch (e) {
      if (!(e instanceof DOMException) || e.name !== "AbortError") {
        throw e;
      }
    }
  }
}

export async function getJobs(
  { client, namespace }: {
    client: OpenapiClient<Paths>;
    namespace: string;
  },
): Promise<Array<K8s["io.k8s.api.batch.v1.Job"]>> {
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
  try {
    const events = k8sApiWatch(
      client.endpoint("/apis/batch/v1/namespaces/{namespace}/jobs").method("get"),
    )({
      path: {
        namespace,
      },
      query: {
        watch: true,
        labelSelector: jobReplicaIndexLabel,
      },
    }, {
      signal,
    });

    for await (const event of events) {
      if (event.type === "ADDED") {
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
      } else {
        exhaustiveMatchingGuard(event.type);
      }
    }
  } catch (e) {
    if (!(e instanceof DOMException) || e.name !== "AbortError") {
      throw e;
    }
  }
}

export async function* watchJobGroups(
  { client, signal, namespace }: { client: OpenapiClient<Paths>; signal: AbortSignal; namespace: string },
): AsyncGenerator<Map<string, AutoscaledJob>> {
  try {
    const map: Map<string, AutoscaledJob> = new Map();

    const events = k8sApiWatch(
      client.endpoint("/apis/shopstic.com/v1/namespaces/{namespace}/autoscaledjobs").method("get"),
    )({
      path: {
        namespace,
      },
      query: {
        watch: true,
      },
    }, {
      signal,
    });

    for await (const event of events) {
      if (event.type === "ADDED" || event.type === "MODIFIED") {
        map.set(event.object.metadata!.uid!, event.object);
      } else if (event.type === "DELETED") {
        map.delete(event.object.metadata!.uid!);
      } else {
        exhaustiveMatchingGuard(event.type);
      }

      yield map;
    }
  } catch (e) {
    if (!(e instanceof DOMException) || e.name !== "AbortError") {
      throw e;
    }
  }
}
