import {
  createK8sDeployment,
  IoK8sApiCoreV1ConfigMapKeySelector,
  K8sDeployment,
  K8sImagePullPolicy,
} from "../../../deps/helmet.ts";
import { IoK8sApiCoreV1PodSpec, IoK8sApiCoreV1ResourceRequirements } from "../../../deps/k8s_utils.ts";
import { createFdbContainer, FdbLocalityMode } from "./fdb_container.ts";
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
    nodeSelector,
    resourceRequirements,
    locality,
  }: {
    baseName: string;
    processClass: "proxy" | "stateless";
    replicas: number;
    baseLabels: Record<string, string>;
    connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    port: number;
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
    nodeSelector?: IoK8sApiCoreV1PodSpec["nodeSelector"];
    resourceRequirements?: IoK8sApiCoreV1ResourceRequirements;
    locality: FdbLocalityMode;
  },
): K8sDeployment {
  const statelessLabels = {
    ...baseLabels,
    "app.kubernetes.io/component": processClass,
    [FDB_COMPONENT_LABEL]: processClass,
  };

  const dataVolumeName = "data";
  const dataVolumeMountPath = "/home/app/data";

  const logVolumeName = "log";
  const logVolumeMountPath = "/home/app/log";

  const container = createFdbContainer({
    processClass,
    image,
    imagePullPolicy,
    volumeMounts: [
      {
        name: dataVolumeName,
        mountPath: dataVolumeMountPath,
      },
      {
        name: logVolumeName,
        mountPath: logVolumeMountPath,
      },
    ],
    connectionStringConfigMapRef,
    resourceRequirements,
    port,
    locality,
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
          nodeSelector,
          containers: [container],
          securityContext: {
            runAsUser: 1001,
            runAsGroup: 1001,
            fsGroup: 1001,
            fsGroupChangePolicy: "OnRootMismatch",
          },
          volumes: [
            {
              name: dataVolumeName,
              emptyDir: {},
            },
            {
              name: logVolumeName,
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
