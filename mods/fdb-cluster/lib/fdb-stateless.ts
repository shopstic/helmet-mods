import {
  createK8sDeployment,
  IoK8sApiCoreV1ConfigMapKeySelector,
  K8sImagePullPolicy,
  K8sResource,
} from "../../../deps/helmet.ts";
import { createFdbContainer } from "./fdb-container.ts";
import { fdbImage, fdbImagePullPolicy } from "./fdb-images.ts";
import { FDB_COMPONENT_LABEL } from "./fdb-stateful.ts";

export function createFdbStatelessResources(
  {
    baseName,
    processClass,
    replicas,
    baseLabels,
    connectionStringConfigMapRef,
    entrypointConfigMapRef,
    dependencyHash,
    port,
    image = fdbImage,
    imagePullPolicy = fdbImagePullPolicy,
    processMemoryGiBs,
  }: {
    baseName: string;
    processClass: "proxy" | "stateless";
    replicas: number;
    baseLabels: Record<string, string>;
    connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    entrypointConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    dependencyHash: string;
    port: number;
    image?: string;
    imagePullPolicy?: K8sImagePullPolicy;
    processMemoryGiBs?: number;
  },
): K8sResource[] {
  const statelessLabels = {
    ...baseLabels,
    "app.kubernetes.io/component": processClass,
    [FDB_COMPONENT_LABEL]: processClass,
  };

  const volumeName = "data";
  const volumeMountPath = "/app/data";
  const entrypointFileName = entrypointConfigMapRef.key;
  const entrypointMountPath = `/app/${entrypointFileName}`;

  const container = createFdbContainer({
    processClass,
    image,
    imagePullPolicy,
    volumeMounts: [
      {
        name: volumeName,
        mountPath: volumeMountPath,
      },
      {
        name: "entrypoint",
        mountPath: entrypointMountPath,
        subPath: entrypointFileName,
      },
    ],
    command: [entrypointMountPath],
    connectionStringConfigMapRef,
    port,
    memoryGiBs: processMemoryGiBs,
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
          annotations: {
            "shopstic.com/dependency-hash": dependencyHash,
          },
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
            {
              name: "entrypoint",
              configMap: {
                name: entrypointConfigMapRef.name,
                defaultMode: 511,
              },
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

  return [deployment];
}
