import { toSnakeCase } from "../../../deps/case.ts";
import {
  IoK8sApiCoreV1ConfigMapKeySelector,
  IoK8sApiCoreV1Container,
  IoK8sApiCoreV1VolumeMount,
  K8sImagePullPolicy,
} from "../../../deps/helmet.ts";

export type FdbConfiguredProcessClass =
  | "coordinator"
  | "proxy"
  | "storage"
  | "log"
  | "stateless";

export function createFdbContainer(
  {
    processClass,
    image,
    imagePullPolicy,
    connectionStringConfigMapRef,
    volumeMounts,
    port,
    args,
    serviceName,
    memoryGiBs,
  }: {
    processClass: FdbConfiguredProcessClass;
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
    connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    volumeMounts: IoK8sApiCoreV1VolumeMount[];
    port: number;
    args: string[];
    memoryGiBs?: number;
    serviceName?: string;
  },
): IoK8sApiCoreV1Container {
  const serviceNameUpperSnakeCased = serviceName
    ? toSnakeCase(serviceName).toUpperCase()
    : "";

  const serviceEnv = serviceNameUpperSnakeCased
    ? [
      {
        name: "FDB_USE_SERVICE_ADDRESS",
        value: "true",
      },
      {
        name: "FDB_K8S_SERVICE_HOST_ENV_NAME",
        value: `${serviceNameUpperSnakeCased}_SERVICE_HOST`,
      },
      {
        name: "FDB_K8S_SERVICE_PORT_ENV_NAME",
        value: `${serviceNameUpperSnakeCased}_SERVICE_PORT_TCP_${port}`,
      },
    ]
    : [
      {
        name: "FDB_USE_SERVICE_ADDRESS",
        value: "false",
      },
    ];

  return {
    name: `${processClass}-${port}`,
    image,
    imagePullPolicy,
    ports: [
      {
        name: `tcp-${port}`,
        containerPort: port,
        protocol: "TCP",
      },
    ],
    readinessProbe: {
      tcpSocket: {
        port,
      },
      initialDelaySeconds: 1,
      periodSeconds: 10,
    },
    livenessProbe: {
      tcpSocket: {
        port,
      },
      initialDelaySeconds: 1,
      periodSeconds: 10,
    },
    env: [
      {
        name: "FDB_CLUSTER_FILE",
        value: "/app/fdb.cluster",
      },
      {
        name: "FDB_PROCESS_CLASS",
        value: processClass,
      },
      {
        name: "FDB_PROCESS_PORT",
        value: String(port),
      },
      {
        name: "FDB_POD_IP",
        valueFrom: {
          fieldRef: {
            fieldPath: "status.podIP",
          },
        },
      },
      {
        name: "FDB_CONNECTION_STRING",
        valueFrom: {
          configMapKeyRef: connectionStringConfigMapRef,
        },
      },
      ...serviceEnv,
      ...((memoryGiBs !== undefined)
        ? [{
          name: "FDB_PROCESS_MEMORY",
          value: `${memoryGiBs}GiB`,
        }]
        : []),
    ],
    args,
    volumeMounts,
  };
}
