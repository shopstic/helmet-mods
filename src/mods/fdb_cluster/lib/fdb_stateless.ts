import type { K8s, K8sDeployment, K8sImagePullPolicy } from "../../../deps/helmet.ts";
import { createK8sDeployment } from "../../../deps/helmet.ts";
import type { FdbLocalityMode } from "./fdb_container.ts";
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
    tolerations,
    nodeSelector,
    resourceRequirements,
    locality,
    args,
    labels,
    topologySpreadConstraints,
  }: {
    baseName: string;
    processClass: "grv_proxy" | "commit_proxy" | "stateless";
    replicas: number;
    baseLabels: Record<string, string>;
    connectionStringConfigMapRef: K8s["core.v1.ConfigMapKeySelector"];
    port: number;
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
    nodeSelector?: Record<string, string>;
    tolerations?: K8s["core.v1.Toleration"][];
    resourceRequirements?: K8s["core.v1.ResourceRequirements"];
    locality: FdbLocalityMode;
    args?: string[];
    labels?: Record<string, string>;
    topologySpreadConstraints?: (labels: Record<string, string>) => Array<K8s["core.v1.TopologySpreadConstraint"]>;
  },
): K8sDeployment {
  const statelessLabels = {
    ...baseLabels,
    "app.kubernetes.io/component": processClass,
    [FDB_COMPONENT_LABEL]: processClass,
    ...labels,
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
    args,
  });

  const deployment = createK8sDeployment({
    metadata: {
      name: `${baseName}-${processClass.replaceAll("_", "-")}`,
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
          tolerations,
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
          topologySpreadConstraints: topologySpreadConstraints ? topologySpreadConstraints(statelessLabels) : [
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
