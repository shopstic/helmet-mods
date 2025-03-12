import type { EC2Client } from "@aws-sdk/client-ec2";
import { ModifyInstanceAttributeCommand, ModifyVolumeCommand } from "@aws-sdk/client-ec2";
import type { BatchInstancesEc2Client } from "../lib/batch_ec2_client.ts";
import type { Logger } from "@wok/utils/logger";
import { ec2WaitForState } from "./shared.ts";
import { assertExists } from "@std/assert/exists";
import type { TakoWarmEc2ServerUpdateSpec } from "../lib/controller.ts";
import { ec2RootVolumeDeviceName } from "../lib/controller.ts";

export async function takoStart(
  { instanceId, updateSpec, ec2Client, batchInstancesEc2Client, signal, logger }: {
    instanceId: string;
    updateSpec?: TakoWarmEc2ServerUpdateSpec;
    ec2Client: EC2Client;
    batchInstancesEc2Client: BatchInstancesEc2Client;
    signal: AbortSignal;
    logger: Logger;
  },
) {
  if (updateSpec !== undefined) {
    if (updateSpec.instanceType !== undefined) {
      logger.info?.("modifying to instance type:", updateSpec.instanceType);
      await ec2Client.send(
        new ModifyInstanceAttributeCommand({
          InstanceId: instanceId,
          InstanceType: { Value: updateSpec.instanceType },
        }),
      );
    }
    if (updateSpec.rootVolumeSizeGibs !== undefined) {
      logger.info?.("determining root EBS volume id");
      const instance = await batchInstancesEc2Client.describe(instanceId);
      const volumeId = instance.Reservations?.[0].Instances?.[0].BlockDeviceMappings?.find((m) =>
        m.DeviceName === ec2RootVolumeDeviceName
      )?.Ebs?.VolumeId;
      assertExists(volumeId, "root volumeId is missing");

      logger.info?.("modifying root EBS volume id:", volumeId, "to size:", updateSpec.rootVolumeSizeGibs);
      try {
        await ec2Client.send(
          new ModifyVolumeCommand({
            VolumeId: volumeId,
            Size: updateSpec.rootVolumeSizeGibs,
          }),
        );
      } catch (e) {
        logger.error?.("failed to modify root EBS volume size", e);
        logger.warn?.("will continue starting the instance; should inherently be retried in the next stop-start cycle");
      }
    }
  }

  logger.info?.("starting");
  await batchInstancesEc2Client.start(instanceId);
  await logger.monitor(
    `waiting for 'running' state`,
    () => ec2WaitForState({ batchInstancesEc2Client, instanceId, state: "running", signal, logger }),
  );
}
