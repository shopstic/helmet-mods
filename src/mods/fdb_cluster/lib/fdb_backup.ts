import type { K8s, K8sDeployment, K8sImagePullPolicy } from "$deps/helmet.ts";
import { createK8sDeployment } from "$deps/helmet.ts";
import { FDB_COMPONENT_LABEL } from "./fdb_stateful.ts";

export function createFdbBackupAgentContainer(
  {
    index,
    image,
    imagePullPolicy,
    connectionStringConfigMapRef,
    volumeMounts,
  }: {
    index: number;
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
    connectionStringConfigMapRef: K8s["core.v1.ConfigMapKeySelector"];
    volumeMounts: K8s["core.v1.VolumeMount"][];
  },
): K8s["core.v1.Container"] {
  return {
    name: `backup-agent-${index}`,
    image,
    imagePullPolicy,
    env: [
      {
        name: "FDB_CLUSTER_FILE",
        value: "/home/app/fdb.cluster",
      },
      {
        name: "FDB_CONNECTION_STRING",
        valueFrom: {
          configMapKeyRef: connectionStringConfigMapRef,
        },
      },
    ],
    volumeMounts,
    args: ["fdb_backup_agent.sh"],
  };
}

export function createFdbBackupDeployment(
  {
    replicas,
    baseName,
    processCountPerPod,
    image,
    imagePullPolicy,
    baseLabels,
    connectionStringConfigMapRef,
    volumeMounts,
    volumes,
    topologySpreadConstraints,
    nodeSelector,
    tolerations,
  }: {
    replicas: number;
    baseName: string;
    processCountPerPod: number;
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
    connectionStringConfigMapRef: K8s["core.v1.ConfigMapKeySelector"];
    volumeMounts: K8s["core.v1.VolumeMount"][];
    volumes: K8s["core.v1.Volume"][];
    baseLabels: Record<string, string>;
    topologySpreadConstraints?: (labels: Record<string, string>) => Array<K8s["core.v1.TopologySpreadConstraint"]>;
    nodeSelector?: Record<string, string>;
    tolerations?: K8s["core.v1.Toleration"][];
  },
): K8sDeployment {
  const labels = {
    ...baseLabels,
    "app.kubernetes.io/component": "backup",
    [FDB_COMPONENT_LABEL]: "backup",
  };

  const containers = Array.from(Array(processCountPerPod).keys()).map((index) =>
    createFdbBackupAgentContainer({
      index,
      image,
      imagePullPolicy,
      connectionStringConfigMapRef,
      volumeMounts,
    })
  );

  return createK8sDeployment({
    metadata: {
      name: `${baseName}-backup`,
      labels,
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
        matchLabels: labels,
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          tolerations,
          nodeSelector,
          containers,
          securityContext: {
            runAsUser: 1001,
            runAsGroup: 1001,
            fsGroup: 1001,
            fsGroupChangePolicy: "OnRootMismatch",
          },
          volumes,
          topologySpreadConstraints: topologySpreadConstraints ? (topologySpreadConstraints(labels)) : [
            {
              maxSkew: 1,
              topologyKey: "kubernetes.io/hostname",
              whenUnsatisfiable: "ScheduleAnyway",
              labelSelector: {
                matchLabels: labels,
              },
            },
          ],
        },
      },
    },
  });
}
