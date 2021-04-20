import {
  createK8sPvc,
  createK8sService,
  createK8sStatefulSet,
  IoK8sApiCoreV1ConfigMapKeySelector,
  IoK8sApiCoreV1Volume,
  K8sImagePullPolicy,
  K8sResource,
} from "../../../deps/helmet.ts";
import { IoK8sApiCoreV1PodSpec } from "../../../deps/k8s_utils.ts";
import {
  createFdbContainer,
  FdbConfiguredProcessClass,
} from "./fdb_container.ts";
import { fdbImage, fdbImagePullPolicy } from "./fdb_images.ts";

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
}

export const STATEFUL_ID_LABEL = "shopstic.com/fdb-stateful-id";
export const FDB_COMPONENT_LABEL = "shopstic.com/fdb-component";

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
}): K8sResource[] {
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
    dataVolumeFactory,
    image = fdbImage,
    imagePullPolicy = fdbImagePullPolicy,
    args,
  }: {
    baseName: string;
    baseLabels: Record<string, string>;
    connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    configs: Record<string, FdbStatefulConfig>;
    dataVolumeFactory: (name: string) => Omit<IoK8sApiCoreV1Volume, "name">;
    image?: string;
    imagePullPolicy?: K8sImagePullPolicy;
    args: string[];
  },
): K8sResource[] {
  const volumeName = "data";
  const volumeMountPath = "/app/data";

  const resources = Object.entries(configs).flatMap(
    (
      [
        id,
        { processClass, nodeSelector, servers },
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
              securityContext: {
                runAsUser: 1001,
                runAsGroup: 1001,
                fsGroup: 1001,
              },
              nodeSelector,
              volumes: [
                {
                  name: volumeName,
                  ...dataVolumeFactory(resourceName),
                },
              ],
            },
          },
        },
      });

      return [
        service,
        statefulSet,
      ];
    },
  );

  return resources;
}
