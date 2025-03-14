import type {
  K8s,
  K8sDeployment,
  K8sIngress,
  K8sRole,
  K8sRoleBinding,
  K8sService,
  K8sServiceAccount,
} from "$deps/helmet.ts";
import {
  createK8sDeployment,
  createK8sIngress,
  createK8sRole,
  createK8sRoleBinding,
  createK8sService,
  createK8sServiceAccount,
} from "$deps/helmet.ts";
import { image as defaultGitlabCicdRegistryImage } from "../../apps/gitlab_cicd_registry/meta.ts";
import type { GitlabCicdRegistryParams } from "../../apps/gitlab_cicd_registry/libs/schemas.ts";
import type { ServiceMonitorV1 } from "../prometheus_operator/prometheus_operator.ts";
import { createServiceMonitorV1 } from "../prometheus_operator/prometheus_operator.ts";
import { toParamCase } from "$deps/case.ts";
export * from "../../apps/gitlab_cicd_registry/libs/schemas.ts";

export const defaultName = "gitlab-cicd-registry";

export interface GitlabCicdRegistryResources {
  service: K8sService;
  ingress?: K8sIngress;
  serviceMonitor?: ServiceMonitorV1;
  deployment: K8sDeployment;
  role: K8sRole;
  roleBinding: K8sRoleBinding;
  serviceAccount: K8sServiceAccount;
}

export function createGitlabCicdRegistryResources({
  name = defaultName,
  image = defaultGitlabCicdRegistryImage,
  namespace,
  ingress: ingressConfig,
  groupId,
  activeProjectLastPushedWithinHours,
  allProjectsRefreshIntervalSeconds,
  perProjectMinRefreshIntervalMs,
  busyJobAnnotation,
  secrets: {
    accessToken,
    webhookSecretToken,
  },
  createServiceMonitor,
  nodeSelector,
  tolerations,
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
      accessToken: K8s["core.v1.SecretKeySelector"];
      webhookSecretToken: K8s["core.v1.SecretKeySelector"];
    };
    createServiceMonitor: boolean;
    nodeSelector?: Record<string, string>;
    tolerations?: K8s["core.v1.Toleration"][];
  }
  & Pick<
    GitlabCicdRegistryParams,
    | "groupId"
    | "activeProjectLastPushedWithinHours"
    | "allProjectsRefreshIntervalSeconds"
    | "perProjectMinRefreshIntervalMs"
    | "busyJobAnnotation"
  >): GitlabCicdRegistryResources {
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

  const args: Omit<GitlabCicdRegistryParams, "accessToken" | "webhookSecretToken"> = {
    groupId,
    allProjectsRefreshIntervalSeconds,
    activeProjectLastPushedWithinHours,
    perProjectMinRefreshIntervalMs,
    webhookServerPort,
    registryServerPort,
    busyJobAnnotation,
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
        apiGroups: ["batch"],
        resources: ["jobs"],
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
          nodeSelector,
          tolerations,
          containers: [
            {
              name: "registry",
              image,
              env: [{
                name: "GITLAB_ACCESS_TOKEN",
                valueFrom: {
                  secretKeyRef: accessToken,
                },
              }, {
                name: "GITLAB_WEBHOOK_SECRET_TOKEN",
                valueFrom: {
                  secretKeyRef: webhookSecretToken,
                },
              }],
              args: Object
                .entries(args)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => `--${toParamCase(k)}=${v}`)
                .concat(
                  "--access-token=$(GITLAB_ACCESS_TOKEN)",
                  "--webhook-secret-token=$(GITLAB_WEBHOOK_SECRET_TOKEN)",
                ),
            },
          ],
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
