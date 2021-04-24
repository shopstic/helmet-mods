import {
  createK8sDeployment,
  IoK8sApiCoreV1ConfigMapKeySelector,
  K8sDeployment,
  K8sImagePullPolicy,
} from "../../../deps/helmet.ts";
import { createFdbContainer } from "./fdb_container.ts";
import { FDB_COMPONENT_LABEL } from "./fdb_stateful.ts";

export function createFdbStatelessDeployment(
  {
    baseName,
    processClass,
    replicas,
    baseLabels,
    connectionStringConfigMapRef,
    port,
    image,
    imagePullPolicy,
  }: {
    baseName: string;
    processClass: "proxy" | "stateless";
    replicas: number;
    baseLabels: Record<string, string>;
    connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    port: number;
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
  },
): K8sDeployment {
  const statelessLabels = {
    ...baseLabels,
    "app.kubernetes.io/component": processClass,
    [FDB_COMPONENT_LABEL]: processClass,
  };

  const volumeName = "data";
  const volumeMountPath = "/app/data";

  const container = createFdbContainer({
    processClass,
    image,
    imagePullPolicy,
    volumeMounts: [
      {
        name: volumeName,
        mountPath: volumeMountPath,
      },
    ],
    connectionStringConfigMapRef,
    port,
  });

  const deployment = createK8sDeployment({
    metadata: {
      name: `${baseName}-${processClass}`,
      labels: statelessLabels,
    },
    spec: {
      replicas,
      strategy: {
        rollingUpdate: {
          maxSurge: "100%",
          maxUnavailable: "100%",
        },
        type: "RollingUpdate",
      },
      selector: {
        matchLabels: statelessLabels,
      },
      template: {
        metadata: {
          labels: statelessLabels,
        },
        spec: {
          containers: [container],
          securityContext: {
            runAsUser: 1001,
            runAsGroup: 1001,
            fsGroup: 1001,
          },
          volumes: [
            {
              name: volumeName,
              emptyDir: {},
            },
          ],
          topologySpreadConstraints: [
            {
              maxSkew: 1,
              topologyKey: "kubernetes.io/hostname",
              whenUnsatisfiable: "ScheduleAnyway",
              labelSelector: {
                matchLabels: statelessLabels,
              },
            },
          ],
        },
      },
    },
  });

  return deployment;
}
