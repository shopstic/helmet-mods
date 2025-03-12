import type { Logger } from "@wok/utils/logger";
import type { BatchInstancesEc2Client } from "../lib/batch_ec2_client.ts";
import { ec2WaitForState } from "./shared.ts";

export async function takoStop(
  { instanceId, batchInstancesEc2Client, signal, logger }: {
    instanceId: string;
    batchInstancesEc2Client: BatchInstancesEc2Client;
    signal: AbortSignal;
    logger: Logger;
  },
) {
  logger.debug?.("stopping instance id:", instanceId);
  await batchInstancesEc2Client.stop(instanceId);
  logger.debug?.("waiting for 'stopped' state");
  await ec2WaitForState({ batchInstancesEc2Client, instanceId, state: "stopped", logger, signal });
}
