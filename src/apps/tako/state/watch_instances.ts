import type { EC2Client } from "@aws-sdk/client-ec2";
import { DescribeInstancesCommand, DescribeVolumesCommand } from "@aws-sdk/client-ec2";
import { assertExists } from "@std/assert/exists";
import { assert } from "@std/assert/assert";
import { delay } from "@std/async/delay";
import { equal } from "@std/assert/equal";
import type { Logger } from "@wok/utils/logger";
import type { TakoWarmEc2Instance } from "../lib/controller.ts";
import {
  ec2NonTerminatedStates,
  takoExecutionIdLabel,
  takoInstalledLabel,
  takoInstalledValue,
} from "../lib/controller.ts";

export async function* takoWatchManagedEc2Instances(
  { ec2Client, signal, pollIntervalMs = 1000, tagName, tagValue, logger }: {
    ec2Client: EC2Client;
    signal: AbortSignal;
    pollIntervalMs?: number;
    logger: Logger;
    tagName: string;
    tagValue: string;
  },
): AsyncGenerator<TakoWarmEc2Instance[]> {
  let lastYield: TakoWarmEc2Instance[] | null = null;

  const shouldYield = (value: TakoWarmEc2Instance[]) => {
    if (!equal(value, lastYield)) {
      lastYield = value;
      return lastYield;
    }
    return null;
  };

  while (!signal.aborted) {
    const res = await ec2Client.send(
      new DescribeInstancesCommand({
        Filters: [
          {
            Name: `tag:${tagName}`,
            Values: [tagValue],
          },
          {
            Name: "instance-state-name",
            Values: ec2NonTerminatedStates as unknown as string[],
          },
        ],
      }),
    );

    const instances = (res.Reservations || []).flatMap((r) =>
      (r.Instances || []).map((instance) => {
        const name = instance.Tags?.find((tag) => tag.Key === "Name")?.Value;
        assertExists(name, "Name is missing");

        const id = instance.InstanceId;
        assertExists(id, "InstanceId is missing");

        const state = instance.State?.Name;
        assertExists(state, "State is missing");
        assert(state !== "terminated", "state is not supposed to be 'terminated' here");

        try {
          const instanceType = instance.InstanceType;
          assertExists(instanceType, "InstanceType is missing");

          const ami = instance.ImageId;
          assertExists(ami, "ImageId is missing");

          const subnetId = instance.SubnetId;
          assertExists(subnetId, "SubnetId is missing");
          assertExists(instance.SecurityGroups, "SecurityGroups is missing");
          const securityGroupIds = instance.SecurityGroups.map((sg) => {
            assertExists(sg.GroupId, "GroupId is missing");
            return sg.GroupId;
          });
          const rootVolumeDeviceName = instance.BlockDeviceMappings?.[0]?.DeviceName;
          assertExists(rootVolumeDeviceName, "DeviceName is missing");

          const rootVolumeId = instance.BlockDeviceMappings?.[0]?.Ebs?.VolumeId;
          assertExists(rootVolumeId, "VolumeId is missing");

          const installed = instance.Tags?.find((tag) => tag.Key === takoInstalledLabel)?.Value === takoInstalledValue;

          const executionId = instance.Tags?.find((tag) => tag.Key === takoExecutionIdLabel)?.Value;
          assertExists(executionId, "executionId label is missing");

          return {
            id,
            state,
            name,
            meta: {
              spec: {
                ami,
                subnetId,
                securityGroupIds,
                instanceType,
                rootVolumeDeviceName,
                rootVolumeId,
              },
              installed,
              executionId,
            },
          };
        } catch (e) {
          if (state !== "running") {
            return {
              id,
              state,
              name,
            };
          } else {
            throw new Error(`Failed to parse instance id: ${id}, name: ${name}, state: ${state}`, {
              cause: e,
            });
          }
        }
      })
    );

    if (instances.length === 0) {
      const maybeYield = shouldYield([]);
      if (maybeYield !== null) {
        yield maybeYield;
      }
    } else {
      for (const [id, list] of Object.entries(Object.groupBy(instances, (i) => i.id))) {
        if (list && list.length > 1) {
          throw new Error(`Got ${list.length} instances with the same id: ${id}`);
        }
      }

      for (const [name, list] of Object.entries(Object.groupBy(instances, (i) => i.name))) {
        if (list && list.length > 1) {
          throw new Error(
            `Got ${list.length} instances with the same name: ${name}. Ids: ${list.map((i) => i.id).join(", ")}`,
          );
        }
      }

      const volumeIds = instances
        .filter((instance) => instance.meta !== undefined)
        .map((instance) => instance.meta.spec.rootVolumeId);

      const volumeSizeByVolumeId = new Map<string, number>();

      if (volumeIds.length > 0) {
        const { Volumes: volumes } = await ec2Client.send(new DescribeVolumesCommand({ VolumeIds: volumeIds }));

        assertExists(volumes, "Volumes is missing");
        if (volumes.length !== volumeIds.length) {
          logger.warn?.(
            "DescribeVolumesCommand returned:",
            volumes.length,
            "volumes vs. the expected count:",
            volumeIds.length,
            "This typically happens when some instances were already terminated",
          );
        }

        for (const volume of volumes) {
          assertExists(volume.VolumeId, "VolumeId is missing");
          assertExists(volume.Size, "Size is missing");
          assert(!volumeSizeByVolumeId.has(volume.VolumeId), "Duplicate VolumeId");
          volumeSizeByVolumeId.set(volume.VolumeId, volume.Size);
        }
      }

      const maybeYield = shouldYield(
        instances.map(({ meta, ...rest }) => ({
          meta: (meta !== undefined && volumeSizeByVolumeId.has(meta.spec.rootVolumeId))
            ? {
              ...meta,
              spec: {
                ...meta.spec,
                rootVolumeSizeGibs: volumeSizeByVolumeId.get(meta.spec.rootVolumeId)!,
              },
            }
            : undefined,
          ...rest,
        } satisfies TakoWarmEc2Instance)),
      );

      if (maybeYield !== null) {
        yield maybeYield;
      }
    }

    await delay(pollIntervalMs, { signal });
  }
}
