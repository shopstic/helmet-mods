import type { Logger } from "@wok/utils/logger";
import type { BatchInstancesEc2Client } from "../lib/batch_ec2_client.ts";
import { ec2WaitForState } from "./shared.ts";
// import { ec2WaitForTermination } from "./exec/shared.ts";

export async function takoDelete(
  { instanceId, batchInstancesEc2Client, logger, signal }: {
    instanceId: string;
    batchInstancesEc2Client: BatchInstancesEc2Client;
    logger: Logger;
    signal: AbortSignal;
  },
) {
  logger.debug?.("terminating");
  await batchInstancesEc2Client.terminate(instanceId);
  logger.debug?.("waiting for termination");
  await ec2WaitForState({ batchInstancesEc2Client, instanceId, state: "terminated", logger, signal });
}
