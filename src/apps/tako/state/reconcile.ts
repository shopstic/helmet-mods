import type { TakoWarmEc2NodeSpec } from "../crd.ts";
import { assert } from "@std/assert/assert";
import { equal } from "@std/assert/equal";
import type { Logger } from "@wok/utils/logger";
import type { K8s } from "@wok/k8s-api";
import type { TakoWarmEc2Instance, TakoWarmEc2ServerUpdateSpec, WarmEc2ServerSpecKey } from "../lib/controller.ts";

export interface TakoExternalState {
  warmEc2Instances: TakoWarmEc2Instance[];
  warmEc2Nodes: TakoWarmEc2NodeSpec[];
  managedPods: K8s["core.v1.Pod"][];
}

export type TakoCreateTask = {
  action: "create";
  spec: TakoWarmEc2NodeSpec;
};

export type TakoStopTask = {
  action: "stop";
  id: string;
  delaySeconds: number;
};

export type TakoForceStopTask = {
  action: "forceStop";
  id: string;
};

export type TakoCancelStopTask = {
  action: "cancelStop";
  id: string;
};

export type TakoDeleteTask = {
  action: "delete";
  id: string;
};

export type TakoReplaceTask = {
  action: "replace";
  id: string;
  spec: TakoWarmEc2NodeSpec;
};

export type TakoStartTask = {
  action: "start";
  id: string;
  serverUpdateSpec?: TakoWarmEc2ServerUpdateSpec;
};

export type TakoTask =
  | TakoCreateTask
  | TakoStopTask
  | TakoForceStopTask
  | TakoCancelStopTask
  | TakoDeleteTask
  | TakoReplaceTask
  | TakoStartTask;

export interface TakoInternalState {
  delayedStopIdSet: Set<string>;
  installingExecutionIdSet: Set<string>;
}

export function takoReconcile(
  { warmEc2Instances, warmEc2Nodes, managedPods }: TakoExternalState,
  { delayedStopIdSet, installingExecutionIdSet }: TakoInternalState,
  { logger }: { logger: Logger },
): TakoTask[] {
  const tasks: TakoTask[] = [];

  const desiredRunningNodeNames = new Set<string>();

  for (const pod of managedPods) {
    const nodeName = pod.spec?.nodeName ??
      pod.spec?.nodeSelector?.["kubernetes.io/hostname"] ??
      pod.spec
        ?.affinity
        ?.nodeAffinity
        ?.requiredDuringSchedulingIgnoredDuringExecution
        ?.nodeSelectorTerms?.[0]
        ?.matchExpressions
        ?.find((expr) =>
          expr.key === "kubernetes.io/hostname" && expr.operator === "In" && Array.isArray(expr.values) &&
          expr.values.length === 1
        )
        ?.values?.[0];
    if (nodeName !== undefined) {
      desiredRunningNodeNames.add(nodeName);
    }
  }

  const currentInstances = warmEc2Instances
    .reduce((acc, instance) => {
      assert(!acc.has(instance.name));
      acc.set(instance.name, instance);
      return acc;
    }, new Map<string, TakoWarmEc2Instance>());

  const desiredNodes = warmEc2Nodes
    .reduce((acc, node) => {
      assert(!acc.has(node.name));
      acc.set(node.name, node);
      return acc;
    }, new Map<string, TakoWarmEc2NodeSpec>());

  for (const [name, spec] of desiredNodes) {
    if (!currentInstances.has(name)) {
      tasks.push({
        action: "create",
        spec,
      });
      continue;
    }
    const instance = currentInstances.get(name)!;

    if (!instance.meta?.installed) {
      continue;
    }

    if (desiredRunningNodeNames.has(name)) {
      if (instance.state === "stopped") {
        const changedFieldSet = new Set<WarmEc2ServerSpecKey>();
        let shouldUpdate = false;
        let shouldReplace = false;

        for (const [k, desiredValue] of Object.entries(spec.server)) {
          const key = k as WarmEc2ServerSpecKey;
          const currentValue = instance.meta.spec[key];
          if (!equal(currentValue, desiredValue)) {
            changedFieldSet.add(key);
            shouldUpdate = true;

            if (!shouldReplace) {
              // Can't shrink a volume, so must replace
              if (key === "rootVolumeSizeGibs" && desiredValue < currentValue) {
                logger.warn?.(
                  "instance id",
                  instance.id,
                  "name:",
                  name,
                  "desired rootVolumeSizeGibs:",
                  desiredValue,
                  "is less than the current size:",
                  currentValue,
                  "will have to replace the instance to accommodate",
                );
                shouldReplace = true;
              } else {
                logger.debug?.(
                  "instance id",
                  instance.id,
                  "name:",
                  name,
                  "key:",
                  key,
                  "changed, will replace",
                );
                shouldReplace = key !== "instanceType" && key !== "rootVolumeSizeGibs";
              }
            }
          }
        }

        if (shouldReplace) {
          tasks.push({
            action: "replace",
            id: instance.id,
            spec,
          });
          continue;
        }

        tasks.push({
          action: "start",
          id: instance.id,
          serverUpdateSpec: shouldUpdate
            ? Object.fromEntries([...changedFieldSet].map((key) => [key, spec.server[key]]))
            : undefined,
        });
        continue;
      } /* else if (instance.state === "stopping") {
          tasks.push({
            action: "forceStop",
            id: instance.id,
          });
        } */

      if (instance.state !== "running") {
        logger.debug?.(
          "node",
          name,
          "is desired to be started. However, it's not in 'stopped' state. Current state is:",
          instance.state,
        );
        continue;
      }

      if (delayedStopIdSet.has(instance.id)) {
        tasks.push({
          action: "cancelStop",
          id: instance.id,
        });
      }
    } else if (instance.state === "running") {
      tasks.push({
        action: "stop",
        id: instance.id,
        delaySeconds: spec.node.stopDelaySeconds,
      });
    } else if (instance.state !== "stopped") {
      logger.debug?.(
        "node",
        name,
        "is desired to be stopped. However, it's not in 'running' state. Current state is:",
        instance.state,
      );
    }
  }

  for (const [name, instance] of currentInstances) {
    if (instance.state !== "shutting-down" && instance.meta !== undefined) {
      const isObsolete = !desiredNodes.has(name);
      const isNotInstalled = !instance.meta.installed && !installingExecutionIdSet.has(instance.meta.executionId);

      if (isObsolete) {
        logger.debug?.("instance id:", instance.id, "name:", instance.name, "is obsolete, will delete");
      } else if (isNotInstalled) {
        logger.warn?.(
          "instance id:",
          instance.id,
          "name:",
          instance.name,
          "executionId:",
          instance.meta.executionId,
          "is not installed, will delete. Current installation set:",
          installingExecutionIdSet,
        );
      }

      if (isObsolete || isNotInstalled) {
        tasks.push({
          action: "delete",
          id: instance.id,
        });
      }
    }
  }

  return tasks;
}
