import {
  createK8sDeployment,
  createK8sIngress,
  createK8sRole,
  createK8sRoleBinding,
  createK8sService,
  createK8sServiceAccount,
  K8sDeployment,
  K8sIngress,
  K8sRole,
  K8sRoleBinding,
  K8sService,
  K8sServiceAccount,
} from "../../deps/helmet.ts";
import { image as defaultGithubActionsRegistryImage } from "../../apps/github_actions_registry/meta.ts";
import { GithubActionsRegistryParams } from "../../apps/github_actions_registry/libs/types.ts";
import { createServiceMonitorV1, ServiceMonitorV1 } from "../prometheus_operator/prometheus_operator.ts";

export const defaultName = "github-actions-registry";

export interface GithubActionsRegistryResources {
  service: K8sService;
  ingress?: K8sIngress;
  serviceMonitor?: ServiceMonitorV1;
  deployment: K8sDeployment;
  role: K8sRole;
  roleBinding: K8sRoleBinding;
  serviceAccount: K8sServiceAccount;
}

export function createGithubActionsRegistryResources({
  name = defaultName,
  image = defaultGithubActionsRegistryImage,
  namespace,
  ingress: ingressConfig,
  appId,
  installationId,
  org,
  clientRefreshIntervalSeconds,
  perRepoMinRefreshIntervalMs,
  allReposRefreshIntervalSeconds,
  activeReposLastPushedWithinHours,
  secrets: {
    privateKey,
    webhookSigningKey,
  },
  createServiceMonitor,
}:
  & {
    name?: string;
    image?: string;
    namespace: string;
    ingress?: {
      hostname: string;
      annotations?: Record<string, string>;
      tlsSecretName?: string;
    };
    secrets: {
      privateKey: {
        key: string;
        name: string;
      };
      webhookSigningKey: {
        key: string;
        name: string;
      };
    };
    createServiceMonitor: boolean;
  }
  & Pick<
    GithubActionsRegistryParams,
    | "appId"
    | "installationId"
    | "org"
    | "clientRefreshIntervalSeconds"
    | "perRepoMinRefreshIntervalMs"
    | "allReposRefreshIntervalSeconds"
    | "activeReposLastPushedWithinHours"
  >): GithubActionsRegistryResources {
  const labels = {
    "app.kubernetes.io/name": defaultName,
    "app.kubernetes.io/instance": name,
  };

  const webhookServerPort = 8080;
  const registryServerPort = 8081;

  const service = createK8sService({
    metadata: {
      name,
      namespace,
    },
    spec: {
      ports: [{
        name: "webhook",
        port: webhookServerPort,
        protocol: "TCP",
      }, {
        name: "registry",
        port: 80,
        targetPort: registryServerPort,
        protocol: "TCP",
      }],
      selector: labels,
    },
  });

  const ingress = ingressConfig
    ? createK8sIngress({
      metadata: {
        name,
        namespace,
        annotations: ingressConfig.annotations,
      },
      spec: {
        rules: [
          {
            host: ingressConfig.hostname,
            http: {
              paths: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: {
                      name,
                      port: {
                        name: "webhook",
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
        tls: [
          {
            hosts: [ingressConfig.hostname],
          },
        ],
      },
    })
    : undefined;

  const secretsMountPath = "/var/secrets";
  const privateKeyFileName = "private-key.pem";
  const webhookSigningKeyFileName = "webhook-signing.key";

  const privateKeyMountPath = `${secretsMountPath}/${privateKeyFileName}`;
  const webhookSigningKeyMountPath = `${secretsMountPath}/${webhookSigningKeyFileName}`;

  const args: GithubActionsRegistryParams = {
    appId,
    installationId,
    org,
    clientRefreshIntervalSeconds,
    perRepoMinRefreshIntervalMs,
    allReposRefreshIntervalSeconds,
    activeReposLastPushedWithinHours,
    webhookServerPort,
    registryServerPort,
    privateKeyPath: privateKeyMountPath,
    webhookSigningKeyPath: webhookSigningKeyMountPath,
  };

  const serviceAccount = createK8sServiceAccount({
    metadata: {
      name,
      namespace,
    },
  });

  const role = createK8sRole({
    metadata: {
      name,
      namespace,
    },
    rules: [
      {
        apiGroups: [""],
        resources: ["pods"],
        verbs: ["get", "update", "patch"],
      },
    ],
  });

  const roleBinding = createK8sRoleBinding({
    metadata: {
      name,
      namespace,
    },
    subjects: [
      {
        kind: "ServiceAccount",
        name,
        namespace,
      },
    ],
    roleRef: {
      kind: "Role",
      name,
      apiGroup: "rbac.authorization.k8s.io",
    },
  });

  const deployment = createK8sDeployment({
    metadata: {
      name,
      namespace,
    },
    spec: {
      selector: {
        matchLabels: labels,
      },
      replicas: 1,
      strategy: {
        type: "Recreate",
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          securityContext: {
            runAsUser: 1001,
            runAsGroup: 1001,
          },
          serviceAccountName: serviceAccount.metadata.name,
          containers: [
            {
              name: "registry",
              image,
              args: Object.entries(args).filter(([_, v]) => v !== undefined).map(([k, v]) => `--${k}=${v}`),
              volumeMounts: [{
                name: "private-key",
                mountPath: privateKeyMountPath,
                subPath: privateKeyFileName,
              }, {
                name: "webhook-signing-key",
                mountPath: webhookSigningKeyMountPath,
                subPath: webhookSigningKeyFileName,
              }],
            },
          ],
          volumes: [{
            name: "private-key",
            secret: {
              secretName: privateKey.name,
              items: [{
                key: privateKey.key,
                path: privateKeyFileName,
              }],
            },
          }, {
            name: "webhook-signing-key",
            secret: {
              secretName: webhookSigningKey.name,
              items: [{
                key: webhookSigningKey.key,
                path: webhookSigningKeyFileName,
              }],
            },
          }],
        },
      },
    },
  });

  const serviceMonitor = createServiceMonitor
    ? createServiceMonitorV1({
      metadata: {
        name,
      },
      spec: {
        endpoints: [
          {
            honorLabels: true,
            interval: "1s",
            path: "/metrics",
            port: "registry",
            scheme: "http",
            scrapeTimeout: "1s",
          },
        ],
        namespaceSelector: {
          matchNames: [namespace],
        },
        selector: {
          matchLabels: service.metadata.labels,
        },
      },
    })
    : undefined;

  return {
    service,
    ingress,
    deployment,
    serviceMonitor,
    role,
    roleBinding,
    serviceAccount,
  };
}
