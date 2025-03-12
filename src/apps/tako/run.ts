import { getDefaultLogger } from "@wok/utils/logger";
import { useBatchInstancesEc2Client } from "./lib/batch_ec2_client.ts";
import { useEc2Client } from "./lib/ec2_client.ts";
import { deleteNodesByNameIfExists } from "./exec/shared.ts";
import { takoWatchWarmEc2Nodes } from "./state/watch_nodes.ts";
import { createCliAction, ExitCode } from "@wok/utils/cli";
import { takoWatchManagedEc2Instances } from "./state/watch_instances.ts";
import { takoWatchManagedPods } from "./state/watch_pods.ts";
import type {
  TakoCancelStopTask,
  TakoCreateTask,
  TakoDeleteTask,
  TakoExternalState,
  TakoForceStopTask,
  TakoReplaceTask,
  TakoStartTask,
  TakoStopTask,
  TakoTask,
} from "./state/reconcile.ts";
import { takoReconcile } from "./state/reconcile.ts";
import { AsyncQueue } from "@wok/utils/async-queue";
import { assertUnreachable } from "@wok/utils/assertion";
import { takoCreate } from "./exec/create.ts";
import { equal } from "@std/assert/equal";
import { takoStart } from "./exec/start.ts";
import { takoDelete } from "./exec/delete.ts";
import { takoStop } from "./exec/stop.ts";
import { cyan, gray, red } from "@std/fmt/colors";
import { delay } from "@std/async/delay";
import { takoForceStop } from "./exec/force_stop.ts";
import type { TakoWarmEc2Node } from "./crd.ts";
import { takoWarmEc2NodeCrdFinalizer } from "./crd.ts";
import { NonEmpStr, Obj, Opt, PortNum, PosInt } from "@wok/schema/schema";
import { useDependentAbortController, useInterval, useProcessSignal, useTimeout } from "@wok/utils/disposable";
import {
  createK3sAgentBootstrapToken,
  createK3sAgentTailscaleAuthKey,
  createTailscaleClient,
} from "./lib/openapi_clients.ts";
import type { TakoK8sPaths } from "./lib/controller.ts";
import { AsyncTtiCache } from "@wok/utils/async-tti-cache";
import { format as formatDuration } from "@std/fmt/duration";
import { useK8sLease } from "@wok/k8s-utils/lease";
import { useK8sClient } from "@wok/k8s-utils/client";

function isExternalStateComplete(state: Partial<TakoExternalState>): state is TakoExternalState {
  return state.managedPods !== undefined && state.warmEc2Nodes !== undefined && state.warmEc2Instances !== undefined;
}

interface Execution<T extends TakoTask = TakoTask> {
  startTime: Date;
  executionId: string;
  task: T;
  promise: Promise<void>;
  cancel(): Promise<void>;
}

async function ignoreAbortError(promise: Promise<void>) {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      // Ignore
    } else {
      throw e;
    }
  }
}

type TakoInstanceTask =
  | TakoStopTask
  | TakoForceStopTask
  | TakoCancelStopTask
  | TakoDeleteTask
  | TakoStartTask;
type TakoCreateOrReplaceTask = TakoCreateTask | TakoReplaceTask;

function createTaskName(task: TakoTask) {
  if (task.action === "create" || task.action === "replace") {
    return `${task.action}:${task.spec.name}`;
  }
  return `${task.action}:${task.id}`;
}

export const takoRunParamSchemas = {
  lease: Obj({
    identity: NonEmpStr(),
    name: NonEmpStr(),
    namespace: NonEmpStr(),
    renewIntervalSeconds: Opt(PosInt(), 10),
    durationSeconds: Opt(PosInt(), 30),
    identityFile: Opt(NonEmpStr()),
  }),
  ec2: Obj({
    sshPrivateKeyPath: NonEmpStr(),
    cloudInitScriptPath: NonEmpStr(),
    keyPairName: NonEmpStr(),
  }),
  k3s: Obj({
    version: NonEmpStr(),
    podCidr: NonEmpStr(),
    lbCpIpv4: NonEmpStr({ format: "ipv4" }),
    lbCpExternalPort: PortNum(),
    clusterCaSha256: NonEmpStr(),
  }),
  ts: Obj({
    apiKey: NonEmpStr(),
    tag: NonEmpStr(),
    org: NonEmpStr(),
    tailnet: NonEmpStr(),
  }),
};

export const TakoRunParams = Obj(takoRunParamSchemas);

export const takoRun = createCliAction(takoRunParamSchemas, async ({
  lease: { identityFile: leaseIdentityFile, ...lease },
  ec2: {
    cloudInitScriptPath,
    sshPrivateKeyPath,
    keyPairName: ec2KeyPairName,
  },
  k3s: {
    version: k3sVersion,
    podCidr: k3sPodCidr,
    lbCpIpv4,
    lbCpExternalPort,
    clusterCaSha256,
  },
  ts: {
    apiKey: tsApiKey,
    tag: tsTag,
    org: tsOrg,
    tailnet: tsTailnet,
  },
}, processSignal) => {
  using udac = useDependentAbortController(processSignal);
  const { abortController: mainAc } = udac;
  const { signal: mainSignal } = mainAc;
  const mainLogger = getDefaultLogger();

  await using k8sClient = await useK8sClient<TakoK8sPaths>();

  const haTestingLogger = mainLogger.prefixed(red("ha-testing"));
  using usingUsr2Signal = useProcessSignal({ signals: ["SIGUSR2"] });

  await using usingLease = await useK8sLease({
    ...lease,
    client: k8sClient,
    logger: mainLogger.prefixed(gray("lease")),
    preAcquisitionSignal: mainSignal,
    async shouldRenew(signal) {
      if (usingUsr2Signal.abortController.signal.aborted) {
        haTestingLogger.warn?.("freezing lease renewal");
        return await new Promise(() => {
          setInterval(() => {
            haTestingLogger.warn?.("still freezing lease renewal...");
          }, 1000);
        });
      }

      try {
        await delay(lease.renewIntervalSeconds * 1000, { signal });
        return true;
      } catch {
        return false;
      }
    },
  });

  if (leaseIdentityFile) {
    mainLogger.info?.("writing lease identity:", lease.identity, "to file:", leaseIdentityFile);
    await Deno.writeTextFile(leaseIdentityFile, lease.identity);
  }

  await using usingEc2Client = useEc2Client({
    maxAttempts: 1,
  }, {
    rateLimit: {
      count: 5,
      perDurationMs: 250,
      onErrorBackoffMs: () => 100 + Math.round(Math.floor(Math.random() * 200)),
    },
    concurrency: 5,
    logger: mainLogger.prefixed(gray("ec2")),
  });

  const { ec2Client } = usingEc2Client;
  await using batchInstancesEc2Client = useBatchInstancesEc2Client({
    ec2Client,
    logger: mainLogger.prefixed(gray("batch-ec2")),
    groupMaxSize: 100,
    groupWithinMs: 500,
  });

  const tsClient = createTailscaleClient({ apiKey: tsApiKey });

  const tailscaleConfig = {
    client: tsClient,
    tag: tsTag,
    organization: tsOrg,
    tailnet: tsTailnet,
  };
  const k8sClientConfig = {
    client: k8sClient,
    checkIntervalMs: 500,
  };

  const k8sBootstrapTokenTtiCache = new AsyncTtiCache<"shared", string>({
    acquire: () =>
      createK3sAgentBootstrapToken({
        k8sClient,
        logger: mainLogger.prefixed(gray("k8s-bootstrap-token")),
        expirySeconds: 15 * 60,
        clusterCaSha256,
      }),
    maxIdleDurationMs: 10 * 60 * 1000,
    staleDurationMs: 5 * 60 * 1000,
    evictionIntervalMs: 5 * 60 * 1000,
    idComparator: () => 0,
  });

  const tsAuthKeyTtiCache = new AsyncTtiCache<"shared", string>({
    acquire: () =>
      createK3sAgentTailscaleAuthKey({
        client: tsClient,
        tag: tsTag,
        org: tsOrg,
        logger: mainLogger.prefixed(gray("ts-auth-key")),
        expirySeconds: 15 * 60,
        reusable: true,
        description: `${tsTag} tako k3s-agent bootstrap`,
      }),
    maxIdleDurationMs: 10 * 60 * 1000,
    staleDurationMs: 5 * 60 * 1000,
    evictionIntervalMs: 5 * 60 * 1000,
    idComparator: () => 0,
  });

  const reconcileLogger = mainLogger.prefixed(gray("reconcile"));
  const cloudInitScript = await Deno.readTextFile(cloudInitScriptPath);

  let executionSeqSeed = 0;
  let lastExternalState: TakoExternalState | null = null;
  const ongoingCreateTaskExecution = new Map<string, Execution<TakoCreateOrReplaceTask>>();

  function executeCreateTask(task: TakoCreateOrReplaceTask, replacing?: Execution<TakoCreateOrReplaceTask>) {
    const executionId = `${createTaskName(task)}:${executionSeqSeed++}`;
    const logger = mainLogger.prefixed(cyan(executionId));
    const dac = useDependentAbortController(mainSignal);
    const promise = logger.monitor("execute", () =>
      ignoreAbortError((async () => {
        try {
          using udac = dac;
          const { abortController } = udac;
          using _ = useTimeout(() => {
            logger.error?.("Task execution timed out");
            abortController.abort(new Error("Task execution timed out"));
          }, 60 * 5 * 1000);

          if (replacing) {
            logger.info?.("cancelling ongoing execution of task:", replacing.task);
            await replacing.cancel();
          }
          ``;

          const { signal } = abortController;

          if (task.action === "replace") {
            await takoDelete({ instanceId: task.id, batchInstancesEc2Client, logger, signal });
          }

          const { instanceId } = await takoCreate({
            batchInstancesEc2Client,
            ec2Client,
            logger,
            signal,
            tailscale: {
              ...tailscaleConfig,
              authKey: await tsAuthKeyTtiCache.get("shared"),
            },
            k8s: k8sClientConfig,
            keyName: ec2KeyPairName,
            privateKeyPath: sshPrivateKeyPath,
            spec: task.spec,
            k3s: {
              token: await k8sBootstrapTokenTtiCache.get("shared"),
              version: k3sVersion,
              podNetworkCidr: k3sPodCidr,
              lbCpIpv4,
              lbCpExternalPort,
            },
            cloudInitScript,
            executionId,
          });

          await logger.monitor(`waiting for instance ${instanceId} to be confirmed installed`, async () => {
            const startTime = Date.now();
            while (Date.now() - startTime < 15_000) {
              if (
                lastExternalState?.warmEc2Instances
                  .some((instance) => instance.id === instanceId && instance.meta?.installed)
              ) {
                return;
              }
              await delay(1_000, { signal });
            }
            throw new Error(`Timed out waiting for instance id: ${instanceId} to be confirmed installed`);
          });
        } finally {
          if (ongoingCreateTaskExecution.get(task.spec.name)?.executionId === executionId) {
            ongoingCreateTaskExecution.delete(task.spec.name);
          }
        }
      })()));

    ongoingCreateTaskExecution.set(task.spec.name, {
      startTime: new Date(),
      executionId,
      task,
      promise,
      cancel() {
        dac.abortController.abort();
        return ignoreAbortError(promise);
      },
    });
  }

  const ongoingInstanceTaskExecution = new Map<string, Execution<TakoInstanceTask>>();

  using _ = useInterval(() => {
    const nowMs = Date.now();
    const ongoingCreateEntries = ongoingCreateTaskExecution
      .values()
      .map((v) => [v.executionId, formatDuration(nowMs - v.startTime.getTime(), { ignoreZero: true })])
      .toArray();

    if (ongoingCreateEntries.length > 0) {
      mainLogger.info?.("ongoing create tasks:", Object.fromEntries(ongoingCreateEntries));
    }

    const ongoingInstanceEntries = ongoingInstanceTaskExecution
      .values()
      .map((v) => [v.executionId, formatDuration(nowMs - v.startTime.getTime(), { ignoreZero: true })])
      .toArray();

    if (ongoingInstanceEntries.length > 0) {
      mainLogger.info?.("ongoing instance tasks:", Object.fromEntries(ongoingInstanceEntries));
    }
  }, 1000);

  function executeInstanceTask(task: TakoInstanceTask, replacing?: Execution<TakoInstanceTask>) {
    const executionId = `${createTaskName(task)}:${executionSeqSeed++}`;
    const logger = mainLogger.prefixed(cyan(executionId));
    const dac = useDependentAbortController(mainSignal);
    const promise = logger.monitor("execute", () =>
      ignoreAbortError((async () => {
        try {
          using udac = dac;
          if (task.action === "cancelStop") {
            if (replacing?.task.action === "stop") {
              logger.info?.("cancelling delayed stop");
              await replacing.cancel();
            }
            return;
          }

          if (replacing) {
            logger.info?.("cancelling ongoing execution of task:", replacing.task);
            await replacing.cancel();
          }

          const { abortController: { signal } } = udac;

          if (task.action === "start") {
            return await takoStart({
              instanceId: task.id,
              updateSpec: task.serverUpdateSpec,
              ec2Client,
              batchInstancesEc2Client,
              signal,
              logger,
            });
          }

          if (task.action === "stop") {
            if (task.delaySeconds > 0) {
              logger.info?.("delaying for:", task.delaySeconds, "seconds");
              await delay(task.delaySeconds * 1000, { signal });
            }
            return await takoStop({ instanceId: task.id, batchInstancesEc2Client, logger, signal });
          }

          if (task.action === "forceStop") {
            return await takoForceStop({
              instanceId: task.id,
              ec2Client,
              logger,
            });
          }

          if (task.action === "delete") {
            return await takoDelete({ instanceId: task.id, batchInstancesEc2Client, logger, signal });
          }
        } finally {
          if (ongoingInstanceTaskExecution.get(task.id)?.executionId === executionId) {
            ongoingInstanceTaskExecution.delete(task.id);
          }
        }

        assertUnreachable(task);
      })()));

    ongoingInstanceTaskExecution.set(task.id, {
      startTime: new Date(),
      executionId,
      task,
      promise,
      cancel() {
        dac.abortController.abort();
        return ignoreAbortError(promise);
      },
    });
  }

  const reconcileQueue = new AsyncQueue<Partial<TakoExternalState>>(1);
  const reconcileLoopPromise = (async () => {
    for await (
      const externalState of reconcileQueue
        .conflate((p, n) => ({ ...p, ...n }))
        .throttle(1, 500)
        .withSignal(mainSignal)
    ) {
      if (isExternalStateComplete(externalState) && !equal(externalState, lastExternalState)) {
        lastExternalState = externalState;
        const tasks = takoReconcile(
          externalState,
          {
            delayedStopIdSet: new Set(
              ongoingInstanceTaskExecution
                .values()
                .filter(({ task }) => task.action === "stop" && task.delaySeconds > 0)
                .map(({ task }) => task.id),
            ),
            installingExecutionIdSet: new Set(
              ongoingCreateTaskExecution
                .values()
                .map(({ executionId }) => executionId),
            ),
          },
          { logger: reconcileLogger },
        );
        reconcileLogger.debug?.("tasks:", tasks.length > 0 ? tasks.map((t) => createTaskName(t)) : "none");

        for (const task of tasks) {
          if (task.action === "create" || task.action === "replace") {
            const ongoingExecution = ongoingCreateTaskExecution.get(task.spec.name);
            if (ongoingExecution !== undefined) {
              if (!equal(ongoingExecution.task.spec, task.spec)) {
                executeCreateTask(task, ongoingExecution);
              } else {
                mainLogger.debug?.("skipping action:", task.action, "name:", task.spec.name, "already in progress");
              }
            } else {
              executeCreateTask(task);
            }
            continue;
          }

          const ongoingExecution = ongoingInstanceTaskExecution.get(task.id);
          if (ongoingExecution !== undefined) {
            if (
              (task.action === "start" && ongoingExecution.task.action === "start") ||
              equal(ongoingExecution.task, task)
            ) {
              mainLogger.debug?.("skipping action:", task.action, "id:", task.id, "already in progress");
            } else {
              executeInstanceTask(task, ongoingExecution);
            }
          } else {
            executeInstanceTask(task);
          }
        }
      }
    }
  })();

  if (mainSignal.aborted) {
    return ExitCode.One;
  }

  const watchWarmEc2NodesPromise = (async () => {
    for await (
      const nodes of AsyncQueue.from(takoWatchWarmEc2Nodes({ client: k8sClient, signal: mainSignal }))
        .conflate((_, n) => n)
        .throttle(1, 500)
    ) {
      const finalizingNodes: TakoWarmEc2Node[] = [];
      const remainingNodes: TakoWarmEc2Node[] = [];

      for (const node of nodes.values()) {
        if (node.metadata.deletionTimestamp !== undefined) {
          if (node.metadata.finalizers?.includes(takoWarmEc2NodeCrdFinalizer)) {
            finalizingNodes.push(node);
          }
        } else {
          remainingNodes.push(node);
        }
      }

      if (finalizingNodes.length > 0) {
        mainLogger.info?.("finalizing nodes:", finalizingNodes.map(({ metadata: { name } }) => name));
        await deleteNodesByNameIfExists({
          k8s: k8sClientConfig,
          tailscale: tailscaleConfig,
          logger: mainLogger.prefixed(gray("finalizer")),
          names: finalizingNodes.map(({ metadata: { name } }) => name),
          signal: mainSignal,
        });

        await Promise.all(finalizingNodes.map(async (node) => {
          const ep = k8sClient.endpoint("/apis/wok.run/v1/warmec2nodes/{name}");
          const patchEp = ep.method("patch");
          const getEp = ep.method("get");

          try {
            await patchEp({
              path: {
                name: node.metadata.name,
              },
              body: [{
                op: "remove",
                path: "/metadata/finalizers",
                value: takoWarmEc2NodeCrdFinalizer,
              }],
              query: {},
            }, {
              headers: {
                "content-type": "application/json-patch+json",
              },
              signal: mainSignal,
            });
          } catch (e) {
            if (e instanceof patchEp.Error && e.status === 404) {
              return;
            }
            throw e;
          }

          while (true) {
            try {
              await getEp({
                path: {
                  name: node.metadata.name,
                },
                query: {},
              });
            } catch (e) {
              if (e instanceof getEp.Error && e.status === 404) {
                return;
              }
            }
            mainLogger.debug?.("waiting for CRD name:", node.metadata.name, "to be removed");
            await delay(500, { signal: mainSignal });
          }
        }));
      }

      await reconcileQueue.enqueue({
        warmEc2Nodes: remainingNodes.map(({ metadata: { name }, spec }) => ({ name, ...spec })),
      });
    }
  })();

  const watchPodsPromise = (async () => {
    for await (const pods of takoWatchManagedPods({ client: k8sClient, signal: mainSignal })) {
      await reconcileQueue.enqueue({
        managedPods: [...pods.values()],
      });
    }
  })();

  const watchEc2InstancesPromise = (async () => {
    for await (
      const instances of takoWatchManagedEc2Instances({
        ec2Client,
        signal: mainSignal,
        logger: mainLogger.prefixed(gray("watch-ec2-instances")),
      })
    ) {
      await reconcileQueue.enqueue({
        warmEc2Instances: instances,
      });
    }
  })();

  const promises = [
    reconcileLoopPromise,
    watchWarmEc2NodesPromise,
    watchPodsPromise,
    watchEc2InstancesPromise,
  ];

  try {
    await Promise.race([usingLease.completion, ...promises]);
  } catch (e) {
    if (e === "SIGINT" || e === "SIGTERM") {
      mainLogger.warn?.("interrupted by signal:", e);
    } else {
      mainLogger.error?.("unexpected error:", e);
      throw e;
    }
  } finally {
    mainLogger.info?.("aborting");
    mainAc.abort();
    await mainLogger.monitor("waiting for all pending promises to settle", () =>
      Promise.allSettled([
        ...promises,
        ...ongoingCreateTaskExecution.values().map((e) => e.promise),
        ...ongoingInstanceTaskExecution.values().map((e) => e.promise),
      ]));
  }

  mainLogger.info?.("exiting");
  return ExitCode.Zero;
});
