import type { TakoWarmEc2NodeSpec } from "../crd.ts";
import type { EC2Client } from "@aws-sdk/client-ec2";
import { CreateTagsCommand, RunInstancesCommand } from "@aws-sdk/client-ec2";
import type { BatchInstancesEc2Client } from "../lib/batch_ec2_client.ts";
import type { Logger } from "@wok/utils/logger";
import { assertExists } from "@std/assert/exists";
import { inheritExec, NonZeroExitError, printLines } from "@wok/utils/exec";
import { retryConditionally } from "@wok/utils/retry";
import type { Ec2InstanceType, TailscaleClient } from "./shared.ts";
import { createSshCmd, deleteNodesByNameIfExists, ec2WaitForState, testSsh, waitPortOpen } from "./shared.ts";
import { gray } from "@std/fmt/colors";
import { stripMargin } from "@wok/utils/strip-margin";
import type { TakoK8sClient } from "../lib/controller.ts";
import {
  ec2RootVolumeDeviceName,
  takoExecutionIdLabel,
  takoInstalledLabel,
  takoInstalledValue,
  takoManagedLabel,
  takoManagedValue,
} from "../lib/controller.ts";

export interface TakoCreateOptions {
  spec: TakoWarmEc2NodeSpec;
  ec2Client: EC2Client;
  batchInstancesEc2Client: BatchInstancesEc2Client;
  logger: Logger;
  signal: AbortSignal;
  keyName: string;
  privateKeyPath: string;
  tailscale: {
    authKey: string;
    tag: string;
    tailnet: string;
    organization: string;
    client: TailscaleClient;
  };
  k8s: {
    client: TakoK8sClient;
    checkIntervalMs?: number;
  };
  k3s: {
    token: string;
    version: string;
    podNetworkCidr: string;
    lbCpIpv4: string;
    lbCpExternalPort: number;
  };
  cloudInitScript: string;
  executionId: string;
}

export async function takoCreate(
  {
    executionId,
    spec,
    keyName,
    privateKeyPath,
    ec2Client,
    batchInstancesEc2Client,
    tailscale,
    k8s,
    cloudInitScript,
    k3s,
    logger,
    signal,
  }: TakoCreateOptions,
) {
  await deleteNodesByNameIfExists({
    names: [spec.name],
    tailscale,
    k8s,
    logger,
    signal,
  });

  logger.debug?.("creating an instance with spec:", spec);
  const runResult = await ec2Client.send(
    new RunInstancesCommand({
      MinCount: 1,
      MaxCount: 1,
      ImageId: spec.server.ami,
      KeyName: keyName,
      SubnetId: spec.server.subnetId,
      SecurityGroupIds: spec.server.securityGroupIds,
      InstanceType: spec.server.instanceType as Ec2InstanceType,
      BlockDeviceMappings: [
        {
          DeviceName: ec2RootVolumeDeviceName,
          Ebs: {
            VolumeSize: spec.server.rootVolumeSizeGibs,
            VolumeType: "gp3",
          },
        },
      ],
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            { Key: "Name", Value: spec.name },
            { Key: takoManagedLabel, Value: takoManagedValue },
            { Key: takoExecutionIdLabel, Value: executionId },
          ],
        },
      ],
    }),
  );

  const instanceId = runResult.Instances?.[0].InstanceId;
  assertExists(instanceId, "Expected instanceId to be defined");
  logger.debug?.("instance created with id:", instanceId);

  try {
    await logger.monitor(
      "wait for running state",
      () => ec2WaitForState({ batchInstancesEc2Client, instanceId, state: "running", signal, logger }),
    );

    const instances = await logger.monitor(
      `describe ${instanceId}`,
      () => batchInstancesEc2Client.describe(instanceId),
    );
    const ipAddress = instances.Reservations?.[0].Instances?.[0].PublicIpAddress;

    if (!ipAddress) {
      logger.error?.("Missing PublicIpAddress in payload", JSON.stringify(instances, null, 2));
    }
    assertExists(ipAddress, "Expected ipAddress to be defined");

    await logger.monitor(
      `wait for ${ipAddress}:22`,
      () => waitPortOpen({ address: ipAddress, port: 22, signal, logger }),
    );

    await logger.monitor("test SSH execution", () =>
      retryConditionally(({ signal }) =>
        testSsh({
          baseCmd: ["timeout", "2"].concat(createSshCmd({
            keyPath: privateKeyPath,
            address: ipAddress,
            user: "ec2-user",
          })),
          signal,
        }), {
        shouldRetryWithBackoffMs({ attempts, error }) {
          const maybeRetryMs = (error instanceof NonZeroExitError) && attempts < 3 ? attempts * 1_000 : false;
          logger.warn?.(
            "testSsh failed, attempts:",
            attempts,
            maybeRetryMs !== false ? `retrying in ${maybeRetryMs}ms` : "won't retry",
          );
          return maybeRetryMs;
        },
        signal,
      }));

    const stdPrint = (tag: string) => {
      const tagged = gray(tag);
      return {
        read: printLines((line) => logger.debug?.(tagged, line)),
      };
    };

    const sshCmd = createSshCmd({
      keyPath: privateKeyPath,
      address: ipAddress,
      user: "ec2-user",
    });

    await logger.monitor("upload setup script", () =>
      inheritExec({
        cmd: [
          ...sshCmd,
          "sudo tee /bin/cloud_init.sh > /dev/null",
        ],
        stdin: {
          pipe: cloudInitScript,
        },
        stdout: stdPrint("[cat ...]"),
        stderr: stdPrint("[cat ...]"),
        signal,
      }));

    const nodeLabelEnv = JSON.stringify(
      spec.node.labels ? Object.entries(spec.node.labels).map(([k, v]) => `${k}=${v}`).join(" ") : "",
    );
    const nodeTaintEnv = JSON.stringify(
      spec.node.taints
        ? spec.node.taints.map(({ key, value, effect }) => `${key}${value !== undefined ? `=${value}` : ""}:${effect}`)
          .join(" ")
        : "",
    );
    await logger.monitor("setup k3s agent", () =>
      inheritExec({
        cmd: [
          ...sshCmd,
          "sudo",
          "bash",
        ],
        stdin: {
          pipe: stripMargin`
            |set -euo pipefail
            |export TS_AUTH_KEY=${JSON.stringify(tailscale.authKey)}
            |export K3S_TOKEN=${JSON.stringify(k3s.token)}
            |export K3S_KUBE_APISERVER_IP=${JSON.stringify(k3s.lbCpIpv4)}
            |export K3S_KUBE_APISERVER_PORT=${JSON.stringify(k3s.lbCpExternalPort)}
            |export K3S_VERSION=${JSON.stringify(k3s.version)}
            |export K3S_POD_NETWORK_CIDR=${JSON.stringify(k3s.podNetworkCidr)}
            |export K3S_NODE_LABEL=${nodeLabelEnv}
            |export K3S_NODE_TAINT=${nodeTaintEnv}
            |
            |hostnamectl set-hostname ${spec.name}
            |chmod +x /bin/cloud_init.sh
            |/bin/cloud_init.sh install_tailscale
            |/bin/cloud_init.sh install_k3s_agent
            |
            |echo "repo_upgrade: none" | tee /etc/cloud/cloud.cfg.d/99_disable_repo_upgrade.cfg
            |systemctl mask update-motd.service
            |systemctl disable --now sshd &
            `,
        },
        stdout: stdPrint("[ssh ...]"),
        stderr: stdPrint("[ssh ...]"),
        signal,
      }));

    logger.info?.("marking instance id:", instanceId, "as installed");
    await ec2Client.send(
      new CreateTagsCommand({
        Resources: [instanceId],
        Tags: [{
          Key: takoInstalledLabel,
          Value: takoInstalledValue,
        }],
      }),
    );

    return { instanceId, ipAddress };
  } catch (e) {
    logger.error?.("encountered an error while setting up node, terminating id:", instanceId);
    await batchInstancesEc2Client.terminate(instanceId);
    throw e;
  }
}
