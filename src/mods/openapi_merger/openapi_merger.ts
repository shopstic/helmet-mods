import type { K8s, K8sDeployment, K8sIngress, K8sSecret, K8sService } from "../../deps/helmet.ts";
import { createK8sDeployment, createK8sIngress, createK8sSecret, createK8sService } from "../../deps/helmet.ts";
import { image as defaultOpenapiMergerImage } from "../../apps/openapi_merger/meta.ts";
import type { OpenapiMergerConfig, OpenapiMergerParams } from "../../apps/openapi_merger/libs/types.ts";
import { stableHash } from "../../deps/stable_hash.ts";

export const defaultName = "gitlab-cicd-registry";

export interface OpenapiMergerResources {
  service: K8sService;
  ingress?: K8sIngress;
  deployment: K8sDeployment;
  secret: K8sSecret;
}

export function createOpenapiMergerResources({
  name = defaultName,
  image = defaultOpenapiMergerImage,
  replicas = 1,
  namespace,
  ingress: ingressConfig,
  nodeSelector,
  tolerations,
  docsPath,
  config,
}:
  & {
    name?: string;
    image?: string;
    replicas?: number;
    namespace: string;
    ingress?: {
      hostname: string;
      annotations?: Record<string, string>;
      tlsSecretName?: string;
    };
    nodeSelector?: Record<string, string>;
    tolerations?: K8s["core.v1.Toleration"][];
    config: OpenapiMergerConfig;
  }
  & Pick<
    OpenapiMergerParams,
    "docsPath"
  >): OpenapiMergerResources {
  const labels = {
    "app.kubernetes.io/name": defaultName,
    "app.kubernetes.io/instance": name,
  };

  const serverPort = 8080;

  const service = createK8sService({
    metadata: {
      name,
      namespace,
    },
    spec: {
      ports: [{
        name: "server",
        port: 80,
        targetPort: serverPort,
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
                        name: "server",
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

  const configMountPath = "/config";
  const configFileName = "config.json";

  const args: OpenapiMergerParams = {
    configFile: `${configMountPath}/${configFileName}`,
    docsPath,
    serverInterface: "0.0.0.0",
    serverPort,
    staticRoot: "/www",
  };

  const secret = createK8sSecret({
    metadata: {
      name,
    },
    data: {
      [configFileName]: btoa(JSON.stringify(config, null, 2)),
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
      replicas,
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
          nodeSelector,
          tolerations,
          volumes: [{
            name: "config",
            secret: {
              secretName: secret.metadata.name,
            },
          }],
          containers: [
            {
              name: "server",
              image,
              volumeMounts: [{
                mountPath: configMountPath,
                name: "config",
              }],
              env: [{
                name: "__CONFIG_HASH__",
                value: stableHash(secret),
              }],
              args: Object
                .entries(args)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => `--${k}=${v}`),
            },
          ],
        },
      },
    },
  });

  return {
    service,
    ingress,
    deployment,
    secret,
  };
}
