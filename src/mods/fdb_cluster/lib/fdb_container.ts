import { toSnakeCase } from "../../../deps/case.ts";
import { K8s, K8sContainer, K8sImagePullPolicy } from "../../../deps/helmet.ts";

export type FdbConfiguredProcessClass =
  | "coordinator"
  | "grv_proxy"
  | "commit_proxy"
  | "storage"
  | "log"
  | "stateless";

export type FdbLocalityMode =
  | "none"
  | "dcid"
  | "data_hall"
  | "zone"
  | "node_as_zone";

function throwOnUnknownLocalityMode(mode: never): never;
function throwOnUnknownLocalityMode(mode: FdbLocalityMode) {
  throw new Error(`Unknown FDB locality mode: ${mode}`);
}

export function createFdbContainer(
  {
    processClass,
    image,
    imagePullPolicy,
    connectionStringConfigMapRef,
    volumeMounts,
    port,
    serviceName,
    locality,
    args,
    resourceRequirements,
  }: {
    processClass: FdbConfiguredProcessClass;
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
    connectionStringConfigMapRef: K8s["core.v1.ConfigMapKeySelector"];
    volumeMounts: K8s["core.v1.VolumeMount"][];
    port: number;
    locality: FdbLocalityMode;
    serviceName?: string;
    args?: string[];
    resourceRequirements?: K8s["core.v1.ResourceRequirements"];
  },
): K8sContainer {
  const serviceNameUpperSnakeCased = serviceName ? toSnakeCase(serviceName).toUpperCase() : "";

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

  const localityEnv: Array<K8s["core.v1.EnvVar"]> = (() => {
    switch (locality) {
      case "none":
        return [];
      case "dcid":
        return [
          {
            name: "FDB_DATACENTER_ID",
            value: "$(NODE_LABEL_TOPOLOGY_KUBERNETES_IO_ZONE)",
          },
        ];
      case "data_hall":
        return [
          {
            name: "FDB_DATA_HALL",
            value: "$(NODE_LABEL_TOPOLOGY_KUBERNETES_IO_ZONE)",
          },
        ];
      case "zone":
        return [
          {
            name: "FDB_ZONE_ID",
            value: "$(NODE_LABEL_TOPOLOGY_KUBERNETES_IO_ZONE)",
          },
        ];

      case "node_as_zone":
        return [
          {
            name: "FDB_ZONE_ID",
            value: "$(NODE_LABEL_KUBERNETES_IO_HOSTNAME)",
          },
        ];
    }

    return throwOnUnknownLocalityMode(locality);
  })();

  return {
    name: `${processClass.replaceAll("_", "-")}-${port}`,
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
        value: "/home/app/fdb.cluster",
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
      ...localityEnv,
    ],
    volumeMounts,
    args: ["fdb_server.sh"].concat(args ?? []),
    resources: resourceRequirements,
  };
}
