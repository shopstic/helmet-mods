import type {
  DescribeInstancesCommandOutput,
  DescribeInstanceStatusCommandOutput,
  EC2Client,
  ServiceInputTypes,
  ServiceOutputTypes,
  StartInstancesCommandOutput,
  StopInstancesCommandOutput,
  TerminateInstancesCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeInstancesCommand,
  DescribeInstanceStatusCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { AsyncQueue } from "@wok/utils/async-queue";
import type { Logger } from "@wok/utils/logger";
import { assert } from "@std/assert/assert";

export interface BatchInstancesEc2Client extends AsyncDisposable {
  stop: (instanceId: string) => Promise<StopInstancesCommandOutput>;
  describe: (instanceId: string) => Promise<DescribeInstancesCommandOutput>;
  describeStatus: (instanceId: string) => Promise<DescribeInstanceStatusCommandOutput>;
  start: (instanceId: string) => Promise<StartInstancesCommandOutput>;
  terminate: (instanceId: string) => Promise<TerminateInstancesCommandOutput>;
}

export function useBatchInstancesEc2Client(
  { ec2Client, logger, groupMaxSize = 100, groupWithinMs = 500 }: {
    ec2Client: EC2Client;
    logger: Logger;
    groupMaxSize?: number;
    groupWithinMs?: number;
  },
) {
  function createInstancesCommandQueue<
    I extends ServiceInputTypes,
    O extends ServiceOutputTypes,
  >(
    ctor: new (params: { InstanceIds: string[] }) => Parameters<typeof ec2Client.send<I, O>>[0],
    key: Extract<keyof NoInfer<O>, string>,
  ) {
    const ac = new AbortController();
    const queue = new AsyncQueue<{ instanceId: string; deferred: PromiseWithResolvers<O> }>(Number.MAX_SAFE_INTEGER);

    const request = async (instanceId: string) => {
      const deferred = Promise.withResolvers<O>();
      await queue.enqueue({
        instanceId,
        deferred,
      });
      return await deferred.promise;
    };

    const dequeuePromise = (async () => {
      for await (const groups of queue.groupWithin(groupMaxSize, groupWithinMs)) {
        try {
          const instanceIds = groups.map((group) => group.instanceId);
          logger.debug?.(ctor.name, ...instanceIds);
          const result = await ec2Client.send(new ctor({ InstanceIds: instanceIds }), { abortSignal: ac.signal });
          const array = result[key];
          assert(Array.isArray(array), `Expected the value at key '${key}' to be an array`);

          const resultByInstanceId = new Map<string, O>();
          for (const item of array) {
            if (Array.isArray(item.Instances)) {
              if (item.Instances.length === 1 && typeof item.Instances[0].InstanceId === "string") {
                resultByInstanceId.set(item.Instances[0].InstanceId, item);
              } else {
                throw new Error(
                  `Expected 'Instances' to be an array of length 1 for an array item of '${key}'. Instead got:\n${
                    JSON.stringify(item, null, 2)
                  }`,
                );
              }
            } else {
              if (typeof item.InstanceId !== "string") {
                throw new Error(
                  `Expected 'InstanceId' to be defined for an array item of '${key}'. Instead got:\n${
                    JSON.stringify(item, null, 2)
                  }`,
                );
              }
              resultByInstanceId.set(item.InstanceId, item);
            }
          }

          for (const { instanceId, deferred } of groups) {
            const value = resultByInstanceId.get(instanceId);
            deferred.resolve({
              ...result,
              [key]: value !== undefined ? [value] : [],
            });
          }
        } catch (e) {
          for (const { deferred } of groups) {
            deferred.reject(e);
          }
        }
      }
    })();

    return {
      request,
      async [Symbol.asyncDispose]() {
        queue.complete();
        ac.abort();
        await dequeuePromise;
      },
    };
  }

  const stopInstance = createInstancesCommandQueue(StopInstancesCommand, "StoppingInstances");
  const describeInstance = createInstancesCommandQueue(DescribeInstancesCommand, "Reservations");
  const describeInstanceStatus = createInstancesCommandQueue(DescribeInstanceStatusCommand, "InstanceStatuses");
  const startInstance = createInstancesCommandQueue(StartInstancesCommand, "StartingInstances");
  const terminateInstance = createInstancesCommandQueue(TerminateInstancesCommand, "TerminatingInstances");

  return {
    stop: stopInstance.request,
    describe: describeInstance.request,
    describeStatus: describeInstanceStatus.request,
    start: startInstance.request,
    terminate: terminateInstance.request,
    async [Symbol.asyncDispose]() {
      await Promise.all([
        stopInstance[Symbol.asyncDispose](),
        describeInstance[Symbol.asyncDispose](),
        startInstance[Symbol.asyncDispose](),
        terminateInstance[Symbol.asyncDispose](),
      ]);
    },
  };
}
