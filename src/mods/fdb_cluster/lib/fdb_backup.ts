import {
  createK8sDeployment,
  IoK8sApiCoreV1ConfigMapKeySelector,
  IoK8sApiCoreV1Container,
  IoK8sApiCoreV1Volume,
  IoK8sApiCoreV1VolumeMount,
  K8sImagePullPolicy,
  K8sResource,
} from "../../../deps/helmet.ts";
import { fdbImage, fdbImagePullPolicy } from "./fdb_images.ts";
import { FDB_COMPONENT_LABEL } from "./fdb_stateful.ts";

export function createFdbBackupAgentContainer(
  {
    index,
    image,
    imagePullPolicy,
    connectionStringConfigMapRef,
    volumeMounts,
    args,
  }: {
    index: number;
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
    connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    volumeMounts: IoK8sApiCoreV1VolumeMount[];
    args: string[];
  },
): IoK8sApiCoreV1Container {
  return {
    name: `backup-agent-${index}`,
    image,
    imagePullPolicy,
    env: [
      {
        name: "FDB_CLUSTER_FILE",
        value: "/app/fdb.cluster",
      },
      {
        name: "FDB_CONNECTION_STRING",
        valueFrom: {
          configMapKeyRef: connectionStringConfigMapRef,
        },
      },
    ],
    volumeMounts,
    command: ["/usr/bin/backup_agent.sh"],
    args,
  };
}

export function createFdbBackupResources(
  {
    replicas,
    baseName,
    processCountPerPod,
    image = fdbImage,
    imagePullPolicy = fdbImagePullPolicy,
    baseLabels,
    connectionStringConfigMapRef,
    volumeMounts,
    volumes,
    args,
  }: {
    replicas: number;
    baseName: string;
    processCountPerPod: number;
    image?: string;
    imagePullPolicy?: K8sImagePullPolicy;
    connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    volumeMounts: IoK8sApiCoreV1VolumeMount[];
    volumes: IoK8sApiCoreV1Volume[];
    baseLabels: Record<string, string>;
    args: string[];
  },
): K8sResource[] {
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
      args,
    })
  );

  const deployment = createK8sDeployment({
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
          containers,
          securityContext: {
            runAsUser: 1001,
            runAsGroup: 1001,
            fsGroup: 1001,
          },
          volumes,
          topologySpreadConstraints: [
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

  return [deployment];
}
