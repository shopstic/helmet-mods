import { equal } from "../../deps/std_testing.ts";
import { immerProduce } from "../../deps/immer.ts";
import { getJobs, jobReplicaIndexLabel, watchJobGroups, watchJobs, watchMetric } from "./libs/autoscaled_job.ts";
import { delay } from "../../deps/async_utils.ts";
import { ulid } from "../../deps/ulid.ts";
import { CliProgram, createCliAction, ExitCode } from "../../deps/cli_utils.ts";
import { AutoscaledJob, AutoscaledJobAutoscaling, K8sJobAutoscalerParamsSchema, Paths } from "./libs/types.ts";
import { Logger2 } from "../../libs/logger.ts";
import { createOpenapiClient, K8s } from "../../deps/k8s_openapi.ts";
import { createReconciliationLoop } from "../../libs/utils.ts";

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
        _,
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
        const logger = new Logger2();
        const autoscalingValues: Map<string, number> = new Map();
        const reconcileLoop = createReconciliationLoop();

        async function reconcile() {
          logger.info({ message: "Reconcile" });

          const jobs = await getJobs({ client, namespace });
          const activeJobsByGroupUid: Map<string, Array<K8s["io.k8s.api.batch.v1.Job"]>> = new Map();

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
            const maxReplicas = autoscaledJob.spec.autoscaling.maxReplicas;
            const desiredJobCount = autoscalingValues.get(uid) || 0;
            const currentJobs = (activeJobsByGroupUid.get(uid) || []);
            const currentJobCount = currentJobs.length;

            if (desiredJobCount > maxReplicas) {
              logger.warn({
                message: `Desired count (${desiredJobCount}) is greater than max allowed ${maxReplicas}`,
                name: autoscaledJob.metadata.name,
                desired: desiredJobCount,
                maxAllowed: maxReplicas,
              });
            }

            const targetJobCount = Math.min(desiredJobCount, maxReplicas);

            if (targetJobCount > currentJobCount) {
              const currentIndexes = currentJobs.map((j) => Number(j.metadata!.labels![jobReplicaIndexLabel]));
              const toCreateCount = targetJobCount - currentJobCount;
              const toCreateIndexes = Array.from({ length: targetJobCount }).map((_, i) => i).filter((i) =>
                !currentIndexes.includes(i)
              );

              logger.info({
                message: `Creating ${toCreateCount} extra jobs`,
                targetJobCount,
                currentJobCount,
                uid,
                name: autoscaledJob.metadata.name,
              });

              const createJobPromises = toCreateIndexes.map(async (index) => {
                const newJob = immerProduce(autoscaledJob.spec.jobTemplate, (draft) => {
                  if (!draft.metadata) {
                    draft.metadata = {};
                  }
                  if (!draft.metadata.labels) {
                    draft.metadata.labels = {};
                  }
                  draft.metadata.labels[jobReplicaIndexLabel] = String(index);
                  draft.metadata.name = (draft.metadata.name ?? autoscaledJob.metadata.name) +
                    `-${index}-${ulid().toLowerCase()}`;
                  draft.metadata.namespace = autoscaledJob.metadata.namespace;

                  if (!draft.metadata.ownerReferences) {
                    draft.metadata.ownerReferences = [];
                  }

                  draft.metadata.ownerReferences.push({
                    apiVersion: autoscaledJob.apiVersion,
                    kind: autoscaledJob.kind,
                    name: autoscaledJob.metadata.name,
                    uid: autoscaledJob.metadata.uid!,
                    controller: true,
                  });

                  if (autoscaledJob.spec.persistentVolumes) {
                    if (!draft.spec!.template!.spec!.volumes) {
                      draft.spec!.template!.spec!.volumes = [];
                    }
                    autoscaledJob.spec.persistentVolumes.forEach((pv) => {
                      draft.spec!.template!.spec!.volumes!.push({
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
                  logger.info({ message: "Created job", name: created.data.metadata?.name });
                } catch (exception) {
                  logger.error({ error: "Failed creating job", exception });
                  throw exception;
                }
              });

              await Promise.all(createJobPromises);
            } else {
              logger.info({
                message: `Nothing to do`,
                targetJobCount,
                currentJobCount,
                name: autoscaledJob.metadata.name,
                uid,
              });
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

              if (!equal(currentMetricWatch.autoscaling, autoscaling)) {
                logger.info({
                  message: "Autoscaling config changed",
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
                  if (autoscalingValues.get(uid) !== autoscalingValue) {
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
          logger.info({ message: "Watching autoscaled jobs" });
          for await (
            jobGroupMap of watchJobGroups({
              client,
              namespace,
              signal,
            })
          ) {
            logger.info({ message: "Autoscaled job watch changed" });
            await reconcileMetricWatches();
            reconcileLoop.request();
          }
        })();

        const jobWatchPromise = (async () => {
          logger.info({ message: "Watching jobs" });
          for await (
            const event of watchJobs({
              client,
              namespace,
              signal,
            })
          ) {
            logger.info({ message: "Job changed", change: event.type, name: event.object.metadata?.name });
            reconcileLoop.request();
          }
        })();

        const mainPromise = (async () => {
          logger.info({ message: "Running reconcile loop" });
          let last = performance.now();
          for await (const _ of reconcileLoop.loop) {
            const now = performance.now();
            const elapseMs = now - last;
            const delayMs = Math.max(minReconcileIntervalMs - elapseMs, 0);
            logger.info({ message: `Going to reconcile ${delayMs > 0 ? `in ${delayMs}ms` : "now"}` });

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
