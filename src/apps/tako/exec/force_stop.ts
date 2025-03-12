import type { Logger } from "@wok/utils/logger";
import type { EC2Client } from "@aws-sdk/client-ec2";
import { StopInstancesCommand } from "@aws-sdk/client-ec2";

export async function takoForceStop(
  { instanceId, ec2Client, logger }: {
    instanceId: string;
    ec2Client: EC2Client;
    logger: Logger;
  },
) {
  logger.debug?.("force stopping instance id:", instanceId);
  await ec2Client.send(
    new StopInstancesCommand({
      InstanceIds: [instanceId],
      Force: true,
    }),
  );
}
