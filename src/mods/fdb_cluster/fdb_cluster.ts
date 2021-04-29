import {
  IoK8sApiCoreV1Volume,
  IoK8sApiCoreV1VolumeMount,
  K8sDeployment,
  K8sService,
  K8sStatefulSet,
} from "../../deps/helmet.ts";
import { IoK8sApiCoreV1ConfigMapKeySelector } from "../../deps/helmet.ts";
import {
  createFdbConfigureResources,
  FdbConfigureResources,
} from "./lib/configurator/fdb_configure.ts";
import {
  createFdbCreateConnectionStringResources,
  FdbCreateConnectionStringResources,
} from "./lib/configurator/fdb_create_connection_string.ts";
import {
  createFdbSyncConnectionStringResources,
  FdbSyncConnectionStringResources,
} from "./lib/configurator/fdb_sync_connection_string.ts";
import {
  createFdbStatefulResources,
  FdbStatefulConfig,
} from "./lib/fdb_stateful.ts";
import { createFdbStatelessDeployment } from "./lib/fdb_stateless.ts";
import { FdbDatabaseConfig } from "../../apps/fdb_configurator/libs/types.ts";
import {
  createFdbExporterResources,
  FdbExporterResources,
} from "./lib/fdb_exporter.ts";
import { createFdbBackupDeployment } from "./lib/fdb_backup.ts";

import { K8sImagePullPolicy } from "../../deps/helmet.ts";
import {
  imageName as fdbImageName,
  version as fdbVersion,
} from "../../apps/fdb/meta.ts";
import {
  imageName as fdbConfiguratorImageName,
  version as fdbConfiguratorVersion,
} from "../../apps/fdb_configurator/meta.ts";

export { fdbConfiguratorVersion, fdbVersion };

export const fdbExporterVersion = "1.1.0";
export const fdbImage = `shopstic/${fdbImageName}:${fdbVersion}`;
export const fdbConfiguratorImage =
  `shopstic/${fdbConfiguratorImageName}:${fdbConfiguratorVersion}`;
export const fdbExporterImage =
  `shopstic/fdb-prometheus-exporter:${fdbExporterVersion}`;

export interface FdbClusterResources {
  backupDeployment?: K8sDeployment;
  proxyDeployment?: K8sDeployment;
  statefulServices: K8sService[];
  statefulSets: K8sStatefulSet[];
  statelessDeployment: K8sDeployment;
  createConnectionString: FdbCreateConnectionStringResources;
  configure: FdbConfigureResources;
  syncConnectionString: FdbSyncConnectionStringResources;
  exporter: FdbExporterResources;
}

export function createFdbClusterResources(
  {
    storageEngine,
    redundancyMode,
    stateless,
    stateful,
    backup,
    baseName,
    namespace,
    image = fdbImage,
    configuratorImage = fdbConfiguratorImage,
    exporterImage = fdbExporterImage,
    createServiceMonitor = true,
    imagePullPolicy = "IfNotPresent",
  }: {
    baseName: string;
    namespace: string;
    storageEngine: FdbDatabaseConfig["storageEngine"];
    redundancyMode: FdbDatabaseConfig["redundancyMode"];
    stateless: {
      mode: "prod";
      proxyCount: number;
      resolverCount: number;
      standbyCount: number;
    } | {
      mode: "dev";
      count?: number;
    };
    backup?: {
      podCount: number;
      agentCountPerPod: number;
      volumeMounts: IoK8sApiCoreV1VolumeMount[];
      volumes: IoK8sApiCoreV1Volume[];
    };
    stateful: Record<string, FdbStatefulConfig>;
    image?: string;
    configuratorImage?: string;
    exporterImage?: string;
    createServiceMonitor?: boolean;
    imagePullPolicy?: K8sImagePullPolicy;
  },
): FdbClusterResources {
  const labels = {
    "app.kubernetes.io/name": baseName,
    "app.kubernetes.io/instance": baseName,
  };

  const connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector = {
    name: `${baseName}-connection-string`,
    key: "connectionString",
  };

  const backupDeployment = backup
    ? createFdbBackupDeployment({
      replicas: backup.podCount,
      baseName,
      processCountPerPod: backup.agentCountPerPod,
      baseLabels: labels,
      connectionStringConfigMapRef,
      volumeMounts: backup.volumeMounts,
      volumes: backup.volumes,
      image,
      imagePullPolicy,
    })
    : undefined;

  const { services: statefulServices, statefulSets } =
    createFdbStatefulResources({
      baseName,
      baseLabels: labels,
      configs: stateful,
      connectionStringConfigMapRef,
      image,
      imagePullPolicy,
    });

  const proxyDeployment = (stateless.mode === "prod")
    ? createFdbStatelessDeployment({
      baseName,
      processClass: "proxy",
      replicas: stateless.proxyCount,
      baseLabels: labels,
      connectionStringConfigMapRef,
      port: 4500,
      image,
      imagePullPolicy,
    })
    : undefined;

  const statelessDeployment = createFdbStatelessDeployment({
    baseName,
    processClass: "stateless",
    replicas: (stateless.mode === "prod")
      ? stateless.resolverCount + stateless.standbyCount + 4
      : stateless.count ?? 1,
    baseLabels: labels,
    connectionStringConfigMapRef,
    port: 4500,
    image,
    imagePullPolicy,
  });

  const coordinatorServiceNames = Object
    .entries(stateful)
    .filter(([_, cfg]) =>
      cfg.processClass === "coordinator" &&
      cfg.servers.filter((s) => !s.excluded).length > 0
    )
    .map(([id, _]) => `${baseName}-${id}`);

  const excludedServiceEndpoints:
    FdbDatabaseConfig["excludedServiceEndpoints"] = Object
      .entries(stateful)
      .filter(([_, cfg]) => cfg.processClass !== "coordinator")
      .flatMap(([id, cfg]) =>
        cfg
          .servers
          .filter((s) => s.excluded)
          .map((s) => ({
            name: `${baseName}-${id}`,
            port: s.port,
          }))
      );

  const logCount = Object
    .entries(stateful)
    .map(([_, r]) =>
      r.processClass === "log" ? r.servers.filter((s) => !s.excluded).length : 0
    )
    .reduce((s, c) => s + c, 0);

  const createConnectionString = createFdbCreateConnectionStringResources({
    baseLabels: labels,
    baseName,
    namespace,
    connectionStringConfigMapRef,
    coordinatorServiceNames: coordinatorServiceNames,
    image: configuratorImage,
    imagePullPolicy,
  });

  const proxyCount = stateless.mode === "prod"
    ? stateless.proxyCount
    : stateless.count ?? 1;
  const resolverCount = stateless.mode === "prod" ? stateless.resolverCount : 1;

  const databaseConfig: FdbDatabaseConfig = {
    storageEngine,
    redundancyMode,
    logCount,
    proxyCount,
    resolverCount,
    coordinatorServiceNames,
    excludedServiceEndpoints,
  };

  const configure = createFdbConfigureResources({
    baseLabels: labels,
    baseName,
    namespace,
    connectionStringConfigMapRef,
    databaseConfig,
    image: configuratorImage,
    imagePullPolicy,
  });

  const syncConnectionString = createFdbSyncConnectionStringResources({
    baseLabels: labels,
    releaseName: baseName,
    namespace,
    connectionStringConfigMapRef,
    image: configuratorImage,
    imagePullPolicy,
  });

  const exporter = createFdbExporterResources({
    name: `${baseName}-exporter`,
    namespace,
    baseLabels: labels,
    dedupProxyImage:
      "shopstic/dedup-proxy:cde8f002fee7962e1da76e9243a19d3409e93299",
    connectionStringConfigMapRef,
    image: exporterImage,
    imagePullPolicy,
    createServiceMonitor,
  });

  return {
    backupDeployment,
    statefulServices,
    statefulSets,
    proxyDeployment,
    statelessDeployment,
    createConnectionString,
    configure,
    syncConnectionString,
    exporter,
  };
}
