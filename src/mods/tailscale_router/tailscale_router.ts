import type { K8s } from "$deps/helmet.ts";
import {
  createK8sCronJob,
  createK8sDeployment,
  createK8sPodDisruptionBudget,
  createK8sRole,
  createK8sRoleBinding,
  createK8sSecret,
  createK8sServiceAccount,
} from "$deps/helmet.ts";
import { stripMargin } from "$libs/utils.ts";
import { createPodAntiAffinity } from "$libs/k8s_utils.ts";
import images from "../../images.json" with { type: "json" };
import { stableDigest } from "@wok/utils/stable-digest";

const defaultName = "tailscale-router";

export const defaultHelperImage = images.tailscaleRouterInit;
export const defaultImage = images.tailscale;

export async function createTailscaleRouterResources(
  {
    replicas = 1,
    name = defaultName,
    image = defaultImage,
    helperImage = defaultHelperImage,
    namespace,
    serviceAccountName,
    clientId,
    clientSecret,
    nodeSelector,
    tolerations,
    helperNodeSelector,
    helperTolerations,
    routeTableIds,
    routeLocalCidrs,
    routeExternalCidrs,
    aclTags,
    extraArgs,
    additionalContainers,
    additionalVolumes,
  }: {
    replicas?: number;
    name?: string;
    image?: string;
    helperImage?: string;
    namespace: string;
    serviceAccountName?: string;
    clientId: string;
    clientSecret: string;
    nodeSelector?: Record<string, string>;
    helperNodeSelector?: Record<string, string>;
    tolerations?: Array<K8s["core.v1.Toleration"]>;
    helperTolerations?: Array<K8s["core.v1.Toleration"]>;
    routeTableIds: string[];
    routeLocalCidrs: string[];
    routeExternalCidrs: string[];
    extraArgs?: string;
    aclTags?: string[];
    additionalContainers?: Array<K8s["core.v1.Container"]>;
    additionalVolumes?: Array<K8s["core.v1.Volume"]>;
  },
) {
  const labels = {
    "app.kubernetes.io/name": defaultName,
    "app.kubernetes.io/instance": name,
  };

  const authKeyRefreshName = `${name}-auth-key-refresh`;
  const authKeySecretName = `${name}-auth-key`;
  const authKeyRefreshServiceAccount = createK8sServiceAccount({
    metadata: {
      name: authKeyRefreshName,
    },
  });

  const authKeyRefreshRole = createK8sRole({
    metadata: {
      name: authKeyRefreshName,
    },
    rules: [
      {
        apiGroups: [""],
        resources: ["secrets"],
        verbs: ["create"],
      },
      {
        apiGroups: [""],
        resources: ["secrets"],
        verbs: ["get", "update", "patch"],
        resourceNames: [authKeySecretName],
      },
      {
        apiGroups: ["batch"],
        resources: ["cronjobs"],
        verbs: ["get"],
        resourceNames: [authKeyRefreshName],
      },
    ],
  });

  const authKeyRefreshRoleBinding = createK8sRoleBinding({
    metadata: {
      name: authKeyRefreshName,
    },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: "Role",
      name: authKeyRefreshRole.metadata.name,
    },
    subjects: [
      {
        kind: "ServiceAccount",
        name: authKeyRefreshName,
      },
    ],
  });

  const secret = createK8sSecret({
    metadata: {
      name,
    },
    data: {
      clientId: btoa(clientId),
      clientSecret: btoa(clientSecret),
      auth: btoa(
        stripMargin`#!/bin/bash
        |set -euo pipefail
        |
        |JOB_RESOURCE_UID=$(kubectl get -n "${namespace}" cronjob "${authKeyRefreshName}" -o jsonpath='{.metadata.uid}')
        |
        |ACCESS_TOKEN=$(curl -d "client_id=$OAUTH_CLIENT_ID" -d "client_secret=$OAUTH_CLIENT_SECRET" \\
        |   "https://api.tailscale.com/api/v2/oauth/token" | \\
        |   jq -r '.access_token')
        |
        |AUTH_KEY=$(curl -u "$ACCESS_TOKEN:" "https://api.tailscale.com/api/v2/tailnet/-/keys" \\
        |  --data-binary '{
        |  "capabilities": {
        |    "devices": {
        |      "create": {
        |        "reusable": true,
        |        "ephemeral": true,
        |        "preauthorized": true,
        |        "tags": ${JSON.stringify(aclTags)}
        |      }
        |    }
        |  },
        |  "expirySeconds": ${60 * 60 * 24 * 2}
        |}' | jq -r '.key')
        |
        |kubectl apply -f - <<EOF
        |apiVersion: v1
        |kind: Secret
        |metadata:
        |  name: ${authKeySecretName}
        |  namespace: ${namespace}
        |  ownerReferences:
        |    - apiVersion: batch/v1
        |      controller: true
        |      kind: CronJob
        |      name: ${authKeyRefreshName}
        |      uid: $JOB_RESOURCE_UID
        |type: Opaque
        |stringData:
        |  authKey: $AUTH_KEY
        |EOF
        |`,
      ),
      init: btoa(
        stripMargin`#!/bin/bash    
        |set -euox pipefail
        |
        |echo "Enabling outbound NAT"
        |nsenter -t 1 -m -u -n -i -p -- iptables -t nat -A POSTROUTING -o tailscale0 -j MASQUERADE
        |
        |INSTANCE_ID=$(nsenter -t 1 -m -u -n -i -p -- ec2-metadata -i | awk '{print $2}') || exit $?
        |echo "Got instance id \${INSTANCE_ID}"
        |
        |ENI_ID=$(aws ec2 describe-instances \\
        |  --filters "Name=instance-id,Values=$INSTANCE_ID" | \\
        |  jq -r '.Reservations[].Instances[] | .NetworkInterfaces[] | select(.Description == "") | .NetworkInterfaceId') || exit $?
        |echo "Found ENI \${ENI_ID}, setting no-source-dest-check"
        |
        |aws ec2 modify-network-interface-attribute \\
        |  --network-interface-id "$ENI_ID" \\
        |  --no-source-dest-check
        |
        |aws-batch-routes -c="$EXTERNAL_CIDRS" -r="$ROUTE_TABLE_IDS" -n="$ENI_ID"
        |`,
      ),
    },
  });

  const authKeyRefreshCronJob = createK8sCronJob({
    metadata: {
      name: authKeyRefreshName,
    },
    spec: {
      schedule: "0 0 * * *",
      concurrencyPolicy: "Replace",
      jobTemplate: {
        spec: {
          backoffLimit: 5,
          activeDeadlineSeconds: 60,
          template: {
            spec: {
              serviceAccountName: authKeyRefreshServiceAccount.metadata.name,
              restartPolicy: "OnFailure",
              nodeSelector: helperNodeSelector,
              tolerations: helperTolerations,
              containers: [
                {
                  name: "auth-key-refresh",
                  image: helperImage,
                  env: [
                    {
                      name: "OAUTH_CLIENT_ID",
                      valueFrom: {
                        secretKeyRef: {
                          key: "clientId",
                          name: secret.metadata.name,
                        },
                      },
                    },
                    {
                      name: "OAUTH_CLIENT_SECRET",
                      valueFrom: {
                        secretKeyRef: {
                          key: "clientSecret",
                          name: secret.metadata.name,
                        },
                      },
                    },
                  ],
                  command: ["/tailscale-router/run.sh"],
                  volumeMounts: [{
                    name: "scripts",
                    mountPath: "/tailscale-router/run.sh",
                    subPath: "auth",
                  }],
                },
              ],
              volumes: [
                {
                  name: "scripts",
                  secret: {
                    secretName: secret.metadata.name,
                    defaultMode: 365,
                  },
                },
              ],
            },
          },
        },
      },
    },
  });

  const podDisruptionBudget = createK8sPodDisruptionBudget({
    metadata: {
      name,
      labels,
    },
    spec: {
      minAvailable: replicas > 1 ? 1 : 0,
      selector: {
        matchLabels: labels,
      },
    },
  });

  const deployment = createK8sDeployment({
    metadata: {
      name,
      labels,
    },
    spec: {
      replicas,
      strategy: replicas > 1
        ? {
          type: "RollingUpdate",
          rollingUpdate: {
            maxUnavailable: 1,
            maxSurge: 0,
          },
        }
        : {
          type: "Recreate",
        },
      selector: {
        matchLabels: labels,
      },
      template: {
        metadata: {
          labels,
          annotations: {
            "helmet.run/dependencies-hash": await stableDigest(secret),
          },
        },
        spec: {
          nodeSelector,
          tolerations,
          enableServiceLinks: false,
          hostNetwork: true,
          hostPID: true,
          serviceAccountName,
          initContainers: [{
            name: "init",
            image: helperImage,
            command: ["/tailscale-router/run.sh"],
            securityContext: {
              privileged: true,
            },
            volumeMounts: [{
              name: "scripts",
              mountPath: "/tailscale-router/run.sh",
              subPath: "init",
            }],
            env: [{
              name: "ROUTE_TABLE_IDS",
              value: routeTableIds.join(","),
            }, {
              name: "EXTERNAL_CIDRS",
              value: routeExternalCidrs.join(","),
            }],
          }],
          affinity: {
            podAntiAffinity: createPodAntiAffinity({
              labels,
              antiAffinity: [{
                key: "kubernetes.io/hostname",
                mode: "required",
              }],
            }),
          },
          containers: [
            {
              name: "tailscale",
              image,
              env: [{
                name: "TS_AUTH_KEY",
                valueFrom: {
                  secretKeyRef: {
                    name: authKeySecretName,
                    key: "authKey",
                  },
                },
              }, {
                name: "TS_ROUTES",
                value: routeLocalCidrs.join(","),
              }, {
                name: "TS_USERSPACE",
                value: "false",
              }, {
                name: "TS_TAILSCALED_EXTRA_ARGS",
                value: "--port=41641",
              }, {
                name: "TS_EXTRA_ARGS",
                value: extraArgs ?? "",
              }],
              command: [
                "/bin/sh",
                "-c",
                "unset KUBERNETES_SERVICE_HOST && exec /usr/local/bin/containerboot",
              ],
              securityContext: {
                privileged: true,
              },
              volumeMounts: [{
                name: "dev-net-tun",
                mountPath: "/dev/net/tun",
                readOnly: false,
              }],
            },
            {
              name: "netshoot",
              image: images.netshoot,
              command: [
                "/bin/bash",
                "-c",
                "trap : TERM INT; sleep infinity & wait",
              ],
            },
            ...additionalContainers ?? [],
          ],
          volumes: [
            {
              name: "dev-net-tun",
              hostPath: {
                path: "/dev/net/tun",
              },
            },
            {
              name: "scripts",
              secret: {
                secretName: secret.metadata.name,
                defaultMode: 365,
              },
            },
            ...additionalVolumes ?? [],
          ],
        },
      },
    },
  });

  return {
    secret,
    deployment,
    podDisruptionBudget,
    authKeyRefreshRole,
    authKeyRefreshRoleBinding,
    authKeyRefreshServiceAccount,
    authKeyRefreshCronJob,
  };
}
