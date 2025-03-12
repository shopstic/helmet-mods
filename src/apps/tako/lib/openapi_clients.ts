import type { paths as TsPaths } from "../gen/tailscale_api.ts";
import { assertExists } from "@std/assert/exists";
import type { K8sApiPaths } from "@wok/k8s-api";
import type { Logger } from "@wok/utils/logger";
import { createK8sSecret } from "@wok/k8s-utils";
import type { OpenapiClient } from "@wok/openapi-client";
import { createOpenapiClient } from "@wok/openapi-client";

function secureRand(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const result: string[] = [];
  const buffer = new Uint8Array(128);
  const maxValidByte = Math.floor(256 / alphabet.length) * alphabet.length;

  while (result.length < length) {
    crypto.getRandomValues(buffer);
    for (let i = 0; i < buffer.length && result.length < length; i++) {
      const randomByte = buffer[i];
      if (randomByte < maxValidByte) {
        result.push(alphabet[randomByte % alphabet.length]);
      }
    }
  }

  return result.join("");
}

export async function createK3sAgentBootstrapToken(
  { k8sClient, logger, expirySeconds = 10 * 60, clusterCaSha256 }: {
    k8sClient: OpenapiClient<K8sApiPaths>;
    logger: Logger;
    expirySeconds?: number;
    clusterCaSha256: string;
  },
) {
  const bootstrapTokenId = secureRand(6);
  const bootstrapTokenSecret = secureRand(16);
  const k3sAgentToken = `K10${clusterCaSha256}::${bootstrapTokenId}.${bootstrapTokenSecret}`;
  const bootstrapTokenK8sSecret = createK8sSecret({
    metadata: {
      name: `bootstrap-token-${bootstrapTokenId}`,
      namespace: "kube-system",
    },
    type: "bootstrap.kubernetes.io/token",
    data: {
      description: btoa(`ephemeral token for setting up k3s agent`),
      "auth-extra-groups": btoa("system:bootstrappers:k3s:default-node-token"),
      expiration: btoa(new Date(Date.now() + expirySeconds * 1000).toISOString()),
      "token-id": btoa(bootstrapTokenId),
      "token-secret": btoa(bootstrapTokenSecret),
      "usage-bootstrap-authentication": btoa("true"),
      "usage-bootstrap-signing": btoa("true"),
    },
  });

  await logger.monitor(
    "Create bootstrap token k8s secret",
    () =>
      k8sClient.endpoint("/api/v1/namespaces/{namespace}/secrets").method("post")({
        path: {
          namespace: "kube-system",
        },
        body: bootstrapTokenK8sSecret,
        query: {},
      }),
  );

  return k3sAgentToken;
}

export async function createK3sAgentTailscaleAuthKey(
  { client, org, tag, reusable = false, expirySeconds = 600, description = "k3s-agent bootstrap", logger }: {
    client: OpenapiClient<TsPaths>;
    org: string;
    tag: string;
    reusable?: boolean;
    expirySeconds?: number;
    description?: string;
    logger: Logger;
  },
) {
  const { data: { key } } = await logger.monitor(
    `Create tailscale auth key org=${org} tag=${tag} reusable=${reusable} expirySeconds=${expirySeconds}`,
    () =>
      client.endpoint("/tailnet/{tailnet}/keys").method("post")({
        path: {
          tailnet: org,
        },
        query: { all: true },
        body: {
          capabilities: {
            devices: {
              create: {
                reusable,
                ephemeral: false,
                preauthorized: true,
                tags: [
                  `tag:${tag}`,
                ],
              },
            },
          },
          expirySeconds,
          description,
        },
      }),
  );

  assertExists(key);
  return key;
}

export function createTailscaleClient({ apiKey }: { apiKey: string }) {
  return createOpenapiClient<TsPaths>({
    baseUrl: "https://api.tailscale.com/api/v2",
    options: {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  });
}
