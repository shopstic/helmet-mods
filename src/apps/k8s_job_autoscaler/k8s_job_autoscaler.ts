import { deepEqual } from "../../deps/std_testing.ts";
import { immerProduce } from "../../deps/immer.ts";
import type { MetricSnapshot } from "./libs/autoscaled_job.ts";
import { getJobs, jobReplicaIndexLabel, watchJobGroups, watchJobs, watchMetric } from "./libs/autoscaled_job.ts";
import { delay } from "../../deps/async_utils.ts";
import { CliProgram, createCliAction, ExitCode } from "../../deps/cli_utils.ts";
import type { AutoscaledJob, AutoscaledJobAutoscaling } from "./libs/schemas.ts";
import { K8sJobAutoscalerParamsSchema } from "./libs/schemas.ts";
import { Logger } from "../../libs/logger.ts";
import type { K8s } from "../../deps/k8s_openapi.ts";
import { createOpenapiClient } from "../../deps/k8s_openapi.ts";
import { createReconciliationLoop } from "../../libs/utils.ts";
import type { Paths } from "./libs/types.ts";

function findNextAvailableIndices(count: number, unavailable: number[]) {
  const ret = [];
  let i = 0;

  while (true) {
    if (!unavailable.includes(i)) {
      ret.push(i);
    }
    if (ret.length === count) {
      return ret;
    }
    i++;
  }
}

await new CliProgram()
  .addAction(
    "run",
    createCliAction(
      K8sJobAutoscalerParamsSchema,
      async (
        {
          apiServerBaseUrl,
          minReconcileIntervalMs,
          namespace: maybeNamespace,
        },
        signal,
      ) => {
        const namespace = maybeNamespace ??
          (await Deno.readTextFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace")).trim();

        const client = createOpenapiClient<Paths>({
          baseUrl: apiServerBaseUrl,
        });
        let jobGroupMap: Map<string, AutoscaledJob> = new Map();
        const metricWatchMap: Map<string, {
          promise: Promise<void>;
          abortController: AbortController;
          autoscaling: AutoscaledJobAutoscaling;
        }> = new Map();
        const logger = new Logger();
        const autoscalingValues: Map<string, MetricSnapshot> = new Map();
        const reconcileLoop = createReconciliationLoop();

        async function reconcile() {
          logger.info({ msg: "Reconcile" });

          const jobs = await getJobs({ client, namespace });
          const activeJobsByGroupUid: Map<string, Array<K8s["batch.v1.Job"]>> = new Map();

          for (const job of jobs) {
            if (
              !job.status || !job.status.conditions ||
              !job.status.conditions.find((c) =>
                (c.type === "Complete" && c.status === "True") || (c.type === "Failed" && c.status === "True")
              )
            ) {
              const ownerReferences = job.metadata!.ownerReferences;

              if (!ownerReferences) {
                logger.error({ "error": "Found a job with no ownerReferences", job });
                throw new Error(`[DEFECT] Found a job with no ownerReferences`);
              }

              const groupReference = ownerReferences.find((r) => r.kind === "AutoscaledJob");

              if (!groupReference) {
                logger.error({ "error": "A job's ownerReferences does not include an AutoscaledJob", job });
                throw new Error(`[DEFECT] A job's ownerReferences does not include an AutoscaledJob`);
              }

              const groupUid = groupReference.uid;

              activeJobsByGroupUid.set(groupUid, (activeJobsByGroupUid.get(groupUid) || []).concat(job));
            }
          }

          for (const [uid, autoscaledJob] of jobGroupMap) {
            const { maxReplicas, busyAnnotation } = autoscaledJob.spec.autoscaling;
            const metricSnapshot = autoscalingValues.get(uid) || { pending: 0, inProgress: null };
            const currentAllJobs = activeJobsByGroupUid.get(uid) || [];
            const currentBusyJobs = busyAnnotation
              ? currentAllJobs.filter((j) =>
                j.metadata?.annotations &&
                j.metadata.annotations[busyAnnotation.name] === busyAnnotation.value
              )
              : [];

            if (metricSnapshot.inProgress !== null && metricSnapshot.inProgress < currentBusyJobs.length) {
              logger.info({
                msg: "Metric snapshot is stale, skipping",
                uid,
                name: autoscaledJob.metadata.name,
                currentBusyJobs: currentBusyJobs.length,
                metricInProgress: metricSnapshot.inProgress,
              });
            } else {
              const desiredFreeJobCount = metricSnapshot.pending;
              const currentFreeJobCount = currentAllJobs.length - currentBusyJobs.length;
              const totalDesiredJobCount = currentBusyJobs.length + desiredFreeJobCount;

              if (totalDesiredJobCount > maxReplicas) {
                logger.warn({
                  msg: `Desired count (${totalDesiredJobCount}) is greater than max allowed ${maxReplicas}`,
                  name: autoscaledJob.metadata.name,
                  desired: totalDesiredJobCount,
                  maxAllowed: maxReplicas,
                });
              }

              const targetFreeJobCount = Math.min(desiredFreeJobCount, maxReplicas - currentBusyJobs.length);

              if (targetFreeJobCount > currentFreeJobCount) {
                const currentIndexes = currentAllJobs.map((j) => Number(j.metadata!.labels![jobReplicaIndexLabel]));
                const toCreateCount = targetFreeJobCount - currentFreeJobCount;
                const toCreateIndexes = findNextAvailableIndices(toCreateCount, currentIndexes);

                logger.info({
                  msg: `Creating ${toCreateCount} extra jobs`,
                  targetFreeJobCount,
                  currentFreeJobCount,
                  uid,
                  name: autoscaledJob.metadata.name,
                  toCreateIndexes,
                });

                const createJobPromises = toCreateIndexes.map(async (index) => {
                  const newJob = immerProduce(autoscaledJob.spec.jobTemplate, (draft) => {
                    if (!draft.metadata) {
                      draft.metadata = {};
                    }

                    const metadata = draft.metadata;

                    if (!metadata.labels) {
                      metadata.labels = {};
                    }

                    metadata.labels[jobReplicaIndexLabel] = String(index);
                    metadata.name = (draft.metadata.name ?? autoscaledJob.metadata.name) +
                      `-${index}-${Date.now()}`;
                    metadata.namespace = autoscaledJob.metadata.namespace;

                    if (!metadata.ownerReferences) {
                      metadata.ownerReferences = [];
                    }

                    metadata.ownerReferences.push({
                      apiVersion: autoscaledJob.apiVersion,
                      kind: autoscaledJob.kind,
                      name: autoscaledJob.metadata.name,
                      uid: autoscaledJob.metadata.uid!,
                      controller: true,
                    });

                    if (autoscaledJob.spec.persistentVolumes) {
                      const templateSpec = draft.spec!.template!.spec!;
                      if (!templateSpec.volumes) {
                        templateSpec.volumes = [];
                      }
                      autoscaledJob.spec.persistentVolumes.forEach((pv) => {
                        templateSpec.volumes!.push({
                          name: pv.volumeName,
                          persistentVolumeClaim: {
                            claimName: `${pv.claimPrefix}${index}`,
                          },
                        });
                      });
                    }
                  });

                  try {
                    const created = await client.endpoint("/apis/batch/v1/namespaces/{namespace}/jobs").method("post")({
                      path: {
                        namespace,
                      },
                      query: {},
                      body: newJob,
                    });
                    logger.info({ msg: "Created job", name: created.data.metadata?.name });
                  } catch (exception) {
                    logger.error({ error: "Failed creating job", exception });
                    throw exception;
                  }
                });

                await Promise.all(createJobPromises);
              } else {
                logger.info({
                  msg: `Nothing to do`,
                  targetFreeJobCount,
                  currentFreeJobCount,
                  name: autoscaledJob.metadata.name,
                  uid,
                });
              }
            }
          }
        }

        async function reconcileMetricWatches() {
          for (const [uid, metricWatch] of metricWatchMap) {
            if (!jobGroupMap.has(uid)) {
              metricWatch.abortController.abort();
              await metricWatch.promise;
              metricWatchMap.delete(uid);
              autoscalingValues.delete(uid);
            }
          }

          for (const [uid, autoscaledJob] of jobGroupMap) {
            const autoscaling = autoscaledJob.spec.autoscaling;
            if (metricWatchMap.has(uid)) {
              const currentMetricWatch = metricWatchMap.get(uid)!;

              if (!deepEqual(currentMetricWatch.autoscaling, autoscaling)) {
                logger.info({
                  msg: "Autoscaling config changed",
                  uid,
                  name: autoscaledJob.metadata.name,
                  autoscaling,
                });
                currentMetricWatch.abortController.abort();
                await currentMetricWatch.promise;
                metricWatchMap.delete(uid);
              }
            }

            if (!metricWatchMap.has(uid)) {
              const abortController = new AbortController();
              const promise = (async () => {
                for await (
                  const autoscalingValue of watchMetric({
                    autoscaling,
                    logger: logger.withContext(autoscaling),
                    signal: abortController.signal,
                  })
                ) {
                  if (!deepEqual(autoscalingValues.get(uid), autoscalingValue)) {
                    autoscalingValues.set(uid, autoscalingValue);
                    reconcileLoop.request();
                  }
                }
              })();
              metricWatchMap.set(uid, {
                promise,
                abortController,
                autoscaling,
              });
            }
          }
        }

        const groupWatchPromise = (async () => {
          logger.info({ msg: "Watching autoscaled jobs" });
          for await (
            jobGroupMap of watchJobGroups({
              client,
              namespace,
              signal,
            })
          ) {
            logger.info({ msg: "Autoscaled job watch changed" });
            await reconcileMetricWatches();
            reconcileLoop.request();
          }
        })();

        const jobWatchPromise = (async () => {
          logger.info({ msg: "Watching jobs" });
          for await (
            const event of watchJobs({
              client,
              namespace,
              signal,
            })
          ) {
            logger.info({ msg: "Job changed", change: event.type, name: event.object.metadata?.name });
            reconcileLoop.request();
          }
        })();

        const mainPromise = (async () => {
          logger.info({ msg: "Running reconcile loop" });
          let last = performance.now();
          for await (const _ of reconcileLoop.loop) {
            const now = performance.now();
            const elapseMs = now - last;
            const delayMs = Math.max(minReconcileIntervalMs - elapseMs, 0);
            logger.info({ msg: `Going to reconcile ${delayMs > 0 ? `in ${delayMs}ms` : "now"}` });

            if (delayMs > 0) {
              await delay(delayMs);
            }
            await reconcile();
            last = performance.now();
          }
        })();

        try {
          await Promise.race([groupWatchPromise, jobWatchPromise, mainPromise]);
        } catch (error) {
          logger.error({ error });
          return ExitCode.One;
        }

        return ExitCode.Zero;
      },
    ),
  )
  .run(Deno.args);
