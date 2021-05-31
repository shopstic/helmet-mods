import {
  createK8sPvc,
  createK8sService,
  createK8sStatefulSet,
  IoK8sApiCoreV1ConfigMapKeySelector,
  K8sImagePullPolicy,
  K8sPvc,
  K8sService,
  K8sStatefulSet,
} from "../../../deps/helmet.ts";
import {
  IoK8sApiCoreV1Affinity,
  IoK8sApiCoreV1PodSpec,
  IoK8sApiCoreV1ResourceRequirements,
} from "../../../deps/k8s_utils.ts";
import {
  createFdbContainer,
  FdbConfiguredProcessClass,
  FdbLocalityMode,
} from "./fdb_container.ts";

export interface FdbStatefulServer {
  port: number;
  excluded?: boolean;
}

export interface FdbStatefulConfig {
  servers: FdbStatefulServer[];
  processClass: "coordinator" | "storage" | "log";
  volumeSize: string;
  storageClassName: string;
  nodeSelector?: IoK8sApiCoreV1PodSpec["nodeSelector"];
  args?: string[];
  affinity?: IoK8sApiCoreV1Affinity;
  resourceRequirements?: IoK8sApiCoreV1ResourceRequirements;
}

export const STATEFUL_ID_LABEL = "helmet.run/fdb-stateful-id";
export const FDB_COMPONENT_LABEL = "helmet.run/fdb-component";

function createStatefulLabels(
  { id, baseLabels, processClass }: {
    id: string;
    baseLabels: Record<string, string>;
    processClass: FdbConfiguredProcessClass;
  },
) {
  return {
    ...baseLabels,
    "app.kubernetes.io/component": processClass,
    [STATEFUL_ID_LABEL]: id,
    [FDB_COMPONENT_LABEL]: processClass,
  };
}

export function createFdbStatefulPersistentVolumeClaims({
  baseLabels,
  baseName,
  configs,
}: {
  baseName: string;
  baseLabels: Record<string, string>;
  configs: Record<string, FdbStatefulConfig>;
}): K8sPvc[] {
  return Object
    .entries(configs)
    .flatMap(
      (
        [
          id,
          { processClass, volumeSize, storageClassName },
        ],
      ) => {
        const resourceName = `${baseName}-${id}`;
        const statefulLabels = createStatefulLabels({
          id,
          baseLabels,
          processClass,
        });

        return createK8sPvc({
          metadata: {
            name: resourceName,
            labels: statefulLabels,
          },
          spec: {
            accessModes: ["ReadWriteOnce"],
            volumeMode: "Filesystem",
            resources: {
              requests: {
                storage: volumeSize,
              },
            },
            storageClassName,
          },
        });
      },
    );
}

export function createFdbStatefulResources(
  {
    baseLabels,
    baseName,
    connectionStringConfigMapRef,
    configs,
    image,
    imagePullPolicy,
    locality,
  }: {
    baseName: string;
    baseLabels: Record<string, string>;
    connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    configs: Record<string, FdbStatefulConfig>;
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
    locality: FdbLocalityMode;
  },
): {
  services: K8sService[];
  statefulSets: K8sStatefulSet[];
} {
  const volumeName = "data";
  const volumeMountPath = "/app/data";

  const resources = Object.entries(configs).flatMap(
    (
      [
        id,
        {
          processClass,
          servers,
          nodeSelector,
          affinity,
          args,
          resourceRequirements,
        },
      ],
    ) => {
      const statefulLabels = createStatefulLabels({
        id,
        baseLabels,
        processClass,
      });
      const resourceName = `${baseName}-${id}`;

      const service = createK8sService({
        metadata: {
          name: `${baseName}-${id}`,
          labels: statefulLabels,
        },
        spec: {
          type: "ClusterIP",
          ports: servers.map(({ port }) => ({
            name: `tcp-${port}`,
            targetPort: port,
            protocol: "TCP",
            port,
          })),
          selector: statefulLabels,
        },
      });

      const containers = servers.map(({ port }) =>
        createFdbContainer({
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
          serviceName: service.metadata.name,
          port,
          args,
          resourceRequirements,
          locality,
        })
      );

      const statefulSet = createK8sStatefulSet({
        metadata: {
          name: resourceName,
          labels: statefulLabels,
        },
        spec: {
          serviceName: resourceName,
          replicas: 1,
          selector: {
            matchLabels: statefulLabels,
          },
          template: {
            metadata: {
              labels: statefulLabels,
            },
            spec: {
              containers,
              affinity,
              securityContext: {
                runAsUser: 1001,
                runAsGroup: 1001,
                fsGroup: 1001,
                fsGroupChangePolicy: "OnRootMismatch",
              },
              nodeSelector,
              volumes: [
                {
                  name: volumeName,
                  persistentVolumeClaim: {
                    claimName: resourceName,
                  },
                },
              ],
            },
          },
        },
      });

      return {
        service,
        statefulSet,
      };
    },
  );

  return {
    services: resources.map(({ service }) => service),
    statefulSets: resources.map(({ statefulSet }) => statefulSet),
  };
}
