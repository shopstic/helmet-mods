import type { OpenapiClient } from "@wok/openapi-client";
import type { paths as TailscalePaths } from "../gen/tailscale_api.ts";
import { delay } from "@std/async/delay";
import type { InstanceStateName, RunInstancesCommandInput } from "@aws-sdk/client-ec2";
import type { BatchInstancesEc2Client } from "../lib/batch_ec2_client.ts";
import type { Logger } from "@wok/utils/logger";
import { captureExec } from "@wok/utils/exec";
import { assertEquals } from "@std/assert/equals";
import { assertExists } from "@std/assert/exists";
import type { TakoK8sClient } from "../lib/controller.ts";

export type { TailscalePaths };
export type TailscaleClient = OpenapiClient<TailscalePaths>;
export type Ec2InstanceType = NonNullable<RunInstancesCommandInput["InstanceType"]>;

export async function deleteNodesByNameIfExists(
  { names, tailscale, k8s, logger, signal }: {
    names: string[];
    tailscale: {
      tag: string;
      tailnet: string;
      organization: string;
      client: TailscaleClient;
    };
    k8s: {
      client: TakoK8sClient;
      checkIntervalMs?: number;
    };
    logger: Logger;
    signal: AbortSignal;
  },
) {
  await Promise.all([
    deleteTailscaleDevicesIfExists({
      names,
      logger,
      signal,
      ...tailscale,
    }),
    deleteK8sNodesIfExists({
      names,
      logger,
      signal,
      ...k8s,
    }),
  ]);
}

export async function deleteTailscaleDevicesIfExists(
  { names, tag, organization, tailnet, client, logger, signal }: {
    names: string[];
    tag: string;
    organization: string;
    tailnet: string;
    client: TailscaleClient;
    logger: Logger;
    signal: AbortSignal;
  },
) {
  logger.debug?.("fetching all tailscale devices");
  const devices = await client.endpoint("/tailnet/{tailnet}/devices").method("get")({
    path: { tailnet: organization },
    query: {
      fields: "default",
    },
  }, { signal });

  const prefixedTag = `tag:${tag}`;

  for (const name of names) {
    const device = devices.data.devices?.find((d) => {
      return d.name === `${name}.${tailnet}` && d.tags?.includes(prefixedTag);
    });

    if (device === undefined) {
      logger.debug?.(
        "tailscale device not found name:",
        name,
        "tag:",
        prefixedTag,
      );
    } else {
      logger.debug?.("found tailscale device name:", name, "tag:", prefixedTag, "id:", device.id);
      logger.debug?.("deleting tailscale device:", device.id);
      await client.endpoint("/device/{deviceId}").method("delete")({
        path: {
          deviceId: String(device.id),
        },
      }, { signal });
    }
  }
}

export async function checkK8sNodeExists(
  { name, client, signal }: { name: string; client: TakoK8sClient; signal: AbortSignal },
) {
  try {
    await client.endpoint("/api/v1/nodes/{name}").method("get")({
      path: { name },
      query: {},
    }, { signal });
    return true;
  } catch {
    return false;
  }
}

export async function deleteK8sNodesIfExists(
  { names, client, logger, signal, checkIntervalMs = 500 }: {
    names: string[];
    client: TakoK8sClient;
    checkIntervalMs?: number;
    logger: Logger;
    signal: AbortSignal;
  },
) {
  await Promise.all(names.map(async (name) => {
    const exists = await checkK8sNodeExists({ name, client, signal });

    if (exists) {
      logger.debug?.("deleting node:", name);
      await client.endpoint("/api/v1/nodes/{name}").method("delete")({
        path: { name },
        query: {},
        body: {
          gracePeriodSeconds: 0,
          // ignoreStoreReadErrorWithClusterBreakingPotential: true,
        },
      }, { signal });

      while (!signal.aborted && await checkK8sNodeExists({ name, client, signal })) {
        logger.debug?.("node still exists", name, "will re-check in", checkIntervalMs, "ms");
        await delay(checkIntervalMs, { signal });
      }
    } else {
      logger.debug?.("node does not exist:", name, "skipping delete");
    }
  }));
}

export async function testPortOpen(
  { address, port, signal }: {
    address: string;
    port: number;
    signal: AbortSignal;
  },
) {
  try {
    const out = (await captureExec({
      cmd: [
        "timeout",
        "2",
        "rustscan",
        "--no-config",
        "--greppable",
        "--addresses",
        address,
        "--ports",
        String(port),
        "--timeout",
        "1000",
        "--tries",
        "1",
      ],
      signal,
    })).out;

    return out.length > 0;
  } catch {
    return false;
  }
}

export async function waitPortOpen(
  { address, port, signal, testIntervalMs = 1000, logger }: {
    address: string;
    port: number;
    signal: AbortSignal;
    logger: Logger;
    testIntervalMs?: number;
  },
) {
  while (!signal?.aborted) {
    const start = performance.now();

    logger.debug?.("testing port open", address, port);
    if (await testPortOpen({ address, port, signal })) {
      break;
    }
    const elapsed = performance.now() - start;
    const toDelay = testIntervalMs - elapsed;

    if (toDelay > 0) {
      await delay(toDelay, { signal });
    }
  }
}

export async function testSsh({ baseCmd, signal }: { baseCmd: string[]; signal?: AbortSignal }) {
  const now = String(Date.now());
  const out = (await captureExec({
    cmd: baseCmd.concat(["echo", now]),
    signal,
  })).out.trim();
  assertEquals(out, now, "SSH test failed");
}

export function createSshCmd({ keyPath, user, address }: { user: string; address: string; keyPath: string }) {
  return [
    "ssh",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "LogLevel=ERROR",
    "-i",
    keyPath,
    `${user}@${address}`,
  ];
}

export async function ec2WaitForState({ batchInstancesEc2Client, instanceId, state, signal, logger }: {
  instanceId: string;
  signal: AbortSignal;
  state: InstanceStateName;
  batchInstancesEc2Client: BatchInstancesEc2Client;
  logger: Logger;
}) {
  while (true) {
    const { Reservations } = await batchInstancesEc2Client.describe(instanceId);

    assertExists(Reservations, "Reservations is missing");
    assertEquals(Reservations.length, 1, "expected exactly 1 reservation");
    assertExists(Reservations[0].Instances, "Reservations[0].Instances is missing");
    assertEquals(Reservations[0].Instances.length, 1, "expected exactly 1 instance in Reservations[0].Instances");
    assertExists(Reservations[0].Instances[0].State, "Reservations[0].Instances[0].State is missing");

    const currentState = Reservations[0].Instances[0].State.Name;

    logger.debug?.("instance state:", currentState);

    if (currentState === state) {
      return;
    }
    await delay(500, { signal });
  }
}

// export async function ec2WaitForTermination({ batchInstancesEc2Client, instanceId, signal, logger }: {
//   instanceId: string;
//   signal: AbortSignal;
//   batchInstancesEc2Client: BatchInstancesEc2Client;
//   logger: Logger;
// }) {
//   while (true) {
//     const { Reservations } = await batchInstancesEc2Client.describe(instanceId);
//     const instanceStatuses = (await batchInstancesEc2Client.describeStatus(instanceId)).InstanceStatuses;
//     if (!instanceStatuses || instanceStatuses.length === 0) {
//       return;
//     }
//     logger.debug?.("instance state:", instanceStatuses[0].InstanceState?.Name);
//     await delay(500, { signal });
//   }
// }
