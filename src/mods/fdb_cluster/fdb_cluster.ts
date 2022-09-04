import {
  IoK8sApiCoreV1Volume,
  IoK8sApiCoreV1VolumeMount,
  K8sDeployment,
  K8sService,
  K8sStatefulSet,
} from "../../deps/helmet.ts";
import { IoK8sApiCoreV1ConfigMapKeySelector } from "../../deps/helmet.ts";
import { createFdbConfigureResources, FdbConfigureResources } from "./lib/configurator/fdb_configure.ts";
import {
  createFdbCreateConnectionStringResources,
  FdbCreateConnectionStringResources,
} from "./lib/configurator/fdb_create_connection_string.ts";
import {
  createFdbSyncConnectionStringResources,
  FdbSyncConnectionStringResources,
} from "./lib/configurator/fdb_sync_connection_string.ts";
import { createFdbStatefulResources, FdbStatefulConfig } from "./lib/fdb_stateful.ts";
import { createFdbStatelessDeployment } from "./lib/fdb_stateless.ts";
import { FdbDatabaseConfig } from "../../apps/fdb_configurator/libs/types.ts";
import { createFdbExporterResources, FdbExporterResources } from "./lib/fdb_exporter.ts";
import { createFdbBackupDeployment } from "./lib/fdb_backup.ts";

import { K8sImagePullPolicy } from "../../deps/helmet.ts";
import { image as fdbImage } from "../../apps/fdb_server/meta.ts";
import { image as fdbConfiguratorImage } from "../../apps/fdb_configurator/meta.ts";
import {
  IoK8sApiCoreV1PodSpec,
  IoK8sApiCoreV1ResourceRequirements,
  IoK8sApiCoreV1TopologySpreadConstraint,
} from "../../deps/k8s_utils.ts";
import { FdbLocalityMode } from "./lib/fdb_container.ts";

export { fdbConfiguratorImage };

export const fdbExporterImage =
  "public.ecr.aws/shopstic/fdb-prometheus-exporter:7.1.21@sha256:34232af0327e7a05580d72efbced682390f277e32af086a4ffed48131db49151";
export const defaultDedupProxyImage =
  "public.ecr.aws/shopstic/dedup-proxy:2.0.1@sha256:bc87c6736d0fc1ce4ee57ec4a03839e77515ae323c6f123f5964acea1a799974";

export interface FdbClusterResources {
  backupDeployment?: K8sDeployment;
  grvProxyDeployment?: K8sDeployment;
  commitProxyDeployment?: K8sDeployment;
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
    perpetualStorageWiggle = 0,
    perpetualStorageWiggleLocality = "0",
    tenantMode = "disabled",
    storageMigrationType = "disabled",
    locality = "none",
    image = fdbImage,
    configuratorImage = fdbConfiguratorImage,
    exporterImage = fdbExporterImage,
    dedupProxyImage = defaultDedupProxyImage,
    createServiceMonitor = true,
    imagePullPolicy = "IfNotPresent",
    labels: extraLabels = {},
    helpersNodeSelector,
    helpersTolerations,
  }: {
    baseName: string;
    namespace: string;
    storageEngine: FdbDatabaseConfig["storageEngine"];
    redundancyMode: FdbDatabaseConfig["redundancyMode"];
    perpetualStorageWiggle?: FdbDatabaseConfig["perpetualStorageWiggle"];
    perpetualStorageWiggleLocality?: FdbDatabaseConfig["perpetualStorageWiggleLocality"];
    tenantMode?: FdbDatabaseConfig["tenantMode"];
    storageMigrationType?: FdbDatabaseConfig["storageMigrationType"];
    stateless: {
      mode: "prod";
      grvProxyCount: number;
      commitProxyCount: number;
      resolverCount: number;
      standbyCount: number;
      nodeSelector?: IoK8sApiCoreV1PodSpec["nodeSelector"];
      tolerations?: IoK8sApiCoreV1PodSpec["tolerations"];
      resourceRequirements?: IoK8sApiCoreV1ResourceRequirements;
      topologySpreadConstraints?: (labels: Record<string, string>) => Array<IoK8sApiCoreV1TopologySpreadConstraint>;
      args?: string[];
    } | {
      mode: "dev";
      count?: number;
      nodeSelector?: IoK8sApiCoreV1PodSpec["nodeSelector"];
      tolerations?: IoK8sApiCoreV1PodSpec["tolerations"];
      resourceRequirements?: IoK8sApiCoreV1ResourceRequirements;
      topologySpreadConstraints?: (labels: Record<string, string>) => Array<IoK8sApiCoreV1TopologySpreadConstraint>;
      args?: string[];
    };
    backup?: {
      podCount: number;
      agentCountPerPod: number;
      volumeMounts: IoK8sApiCoreV1VolumeMount[];
      volumes: IoK8sApiCoreV1Volume[];
    };
    stateful: Record<string, FdbStatefulConfig>;
    locality?: FdbLocalityMode;
    image?: string;
    configuratorImage?: string;
    exporterImage?: string;
    dedupProxyImage?: string;
    createServiceMonitor?: boolean;
    imagePullPolicy?: K8sImagePullPolicy;
    labels?: Record<string, string>;
    helpersNodeSelector?: IoK8sApiCoreV1PodSpec["nodeSelector"];
    helpersTolerations?: IoK8sApiCoreV1PodSpec["tolerations"];
  },
): FdbClusterResources {
  const labels = {
    "app.kubernetes.io/name": baseName,
    "app.kubernetes.io/instance": baseName,
    ...extraLabels,
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
      topologySpreadConstraints: stateless.topologySpreadConstraints,
      nodeSelector: helpersNodeSelector,
      tolerations: helpersTolerations,
    })
    : undefined;

  const { services: statefulServices, statefulSets } = createFdbStatefulResources({
    baseName,
    baseLabels: labels,
    configs: stateful,
    connectionStringConfigMapRef,
    image,
    imagePullPolicy,
    locality,
  });

  const grvProxyDeployment = (stateless.mode === "prod")
    ? createFdbStatelessDeployment({
      baseName,
      processClass: "grv_proxy",
      replicas: stateless.grvProxyCount,
      baseLabels: labels,
      connectionStringConfigMapRef,
      port: 4500,
      image,
      imagePullPolicy,
      nodeSelector: stateless.nodeSelector,
      tolerations: stateless.tolerations,
      resourceRequirements: stateless.resourceRequirements,
      locality,
      args: stateless.args,
      topologySpreadConstraints: stateless.topologySpreadConstraints,
    })
    : undefined;

  const commitProxyDeployment = (stateless.mode === "prod")
    ? createFdbStatelessDeployment({
      baseName,
      processClass: "commit_proxy",
      replicas: stateless.commitProxyCount,
      baseLabels: labels,
      connectionStringConfigMapRef,
      port: 4500,
      image,
      imagePullPolicy,
      nodeSelector: stateless.nodeSelector,
      tolerations: stateless.tolerations,
      resourceRequirements: stateless.resourceRequirements,
      locality,
      args: stateless.args,
      topologySpreadConstraints: stateless.topologySpreadConstraints,
    })
    : undefined;

  const statelessDeployment = createFdbStatelessDeployment({
    baseName,
    processClass: "stateless",
    replicas: (stateless.mode === "prod") ? stateless.resolverCount + stateless.standbyCount + 4 : stateless.count ?? 1,
    baseLabels: labels,
    connectionStringConfigMapRef,
    port: 4500,
    image,
    imagePullPolicy,
    nodeSelector: stateless.nodeSelector,
    tolerations: stateless.tolerations,
    resourceRequirements: stateless.resourceRequirements,
    locality,
    args: stateless.args,
    topologySpreadConstraints: stateless.topologySpreadConstraints,
  });

  const coordinatorServiceNames = Object
    .entries(stateful)
    .filter(([_, cfg]) =>
      cfg.processClass === "coordinator" &&
      cfg.servers.filter((s) => !s.excluded).length > 0
    )
    .map(([id, _]) => `${baseName}-${id}`);

  const excludedServiceEndpoints: FdbDatabaseConfig["excludedServiceEndpoints"] = Object
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
    .map(([_, r]) => r.processClass === "log" ? r.servers.filter((s) => !s.excluded).length : 0)
    .reduce((s, c) => s + c, 0);

  const createConnectionString = createFdbCreateConnectionStringResources({
    baseLabels: labels,
    baseName,
    namespace,
    connectionStringConfigMapRef,
    coordinatorServiceNames: coordinatorServiceNames,
    image: configuratorImage,
    imagePullPolicy,
    nodeSelector: helpersNodeSelector,
    tolerations: helpersTolerations,
  });

  const grvProxyCount = stateless.mode === "prod" ? stateless.grvProxyCount : stateless.count ?? 1;
  const commitProxyCount = stateless.mode === "prod" ? stateless.commitProxyCount : stateless.count ?? 1;
  const resolverCount = stateless.mode === "prod" ? stateless.resolverCount : 1;

  const databaseConfig: FdbDatabaseConfig = {
    storageEngine,
    redundancyMode,
    perpetualStorageWiggle,
    perpetualStorageWiggleLocality,
    storageMigrationType,
    tenantMode,
    logCount,
    grvProxyCount,
    commitProxyCount,
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
    nodeSelector: helpersNodeSelector,
    tolerations: helpersTolerations,
  });

  const syncConnectionString = createFdbSyncConnectionStringResources({
    baseLabels: labels,
    releaseName: baseName,
    namespace,
    connectionStringConfigMapRef,
    image: configuratorImage,
    imagePullPolicy,
    nodeSelector: helpersNodeSelector,
    tolerations: helpersTolerations,
  });

  const exporter = createFdbExporterResources({
    name: `${baseName}-exporter`,
    namespace,
    baseLabels: labels,
    dedupProxyImage: dedupProxyImage,
    connectionStringConfigMapRef,
    image: exporterImage,
    imagePullPolicy,
    createServiceMonitor,
    nodeSelector: helpersNodeSelector,
    tolerations: helpersTolerations,
  });

  return {
    backupDeployment,
    statefulServices,
    statefulSets,
    grvProxyDeployment,
    commitProxyDeployment,
    statelessDeployment,
    createConnectionString,
    configure,
    syncConnectionString,
    exporter,
  };
}
