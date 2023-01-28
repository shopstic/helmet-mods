import { K8s, K8sDeployment, K8sService, K8sStatefulSet } from "../../deps/helmet.ts";
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
import { FdbLocalityMode } from "./lib/fdb_container.ts";

export { fdbConfiguratorImage };

export const fdbExporterImage =
  "public.ecr.aws/shopstic/fdb-prometheus-exporter:7.1.21@sha256:34232af0327e7a05580d72efbced682390f277e32af086a4ffed48131db49151";
export const defaultDedupProxyImage =
  "public.ecr.aws/shopstic/dedup-proxy:2.0.1@sha256:bc87c6736d0fc1ce4ee57ec4a03839e77515ae323c6f123f5964acea1a799974";

export interface FdbClusterResources {
  backupDeployment?: K8sDeployment;
  coordinatorServices: K8sService[];
  coordinatorStatefulSets: K8sStatefulSet[];
  currentGrvProxyDeployment?: K8sDeployment;
  nextGrvProxyDeployment?: K8sDeployment;
  currentCommitProxyDeployment?: K8sDeployment;
  nextCommitProxyDeployment?: K8sDeployment;
  currentStatefulServices: K8sService[];
  nextStatefulServices: K8sService[];
  currentStatefulSets: K8sStatefulSet[];
  nextStatefulSets: K8sStatefulSet[];
  currentStatelessDeployment: K8sDeployment;
  nextStatelessDeployment?: K8sDeployment;
  createConnectionString: FdbCreateConnectionStringResources;
  configure: FdbConfigureResources;
  syncConnectionString: FdbSyncConnectionStringResources;
  exporter: FdbExporterResources;
}

export interface FdbClusterGeneration {
  id: string;
  stateless: {
    mode: "prod";
    grvProxyCount: number;
    commitProxyCount: number;
    resolverCount: number;
    standbyCount: number;
    nodeSelector?: Record<string, string>;
    tolerations?: K8s["core.v1.Toleration"][];
    resourceRequirements?: K8s["core.v1.ResourceRequirements"];
    topologySpreadConstraints?: (labels: Record<string, string>) => Array<K8s["core.v1.TopologySpreadConstraint"]>;
    args?: string[];
  } | {
    mode: "dev";
    count?: number;
    nodeSelector?: Record<string, string>;
    tolerations?: K8s["core.v1.Toleration"][];
    resourceRequirements?: K8s["core.v1.ResourceRequirements"];
    topologySpreadConstraints?: (labels: Record<string, string>) => Array<K8s["core.v1.TopologySpreadConstraint"]>;
    args?: string[];
  };
  stateful: Record<string, FdbStatefulConfig>;
  image?: string;
  labels?: Record<string, string>;
}

export function createFdbClusterResources(
  {
    storageEngine,
    redundancyMode,
    backup,
    baseName,
    namespace,
    perpetualStorageWiggle = 0,
    perpetualStorageWiggleLocality = "0",
    tenantMode = "disabled",
    storageMigrationType = "disabled",
    coordinators,
    currentGeneration,
    nextGeneration,
    locality = "none",
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
    coordinators: Record<string, FdbStatefulConfig>;
    currentGeneration: FdbClusterGeneration;
    nextGeneration?: FdbClusterGeneration;
    backup?: {
      podCount: number;
      agentCountPerPod: number;
      volumeMounts: K8s["core.v1.VolumeMount"][];
      volumes: K8s["core.v1.Volume"][];
    };
    locality?: FdbLocalityMode;
    configuratorImage?: string;
    exporterImage?: string;
    dedupProxyImage?: string;
    createServiceMonitor?: boolean;
    imagePullPolicy?: K8sImagePullPolicy;
    labels?: Record<string, string>;
    helpersNodeSelector?: Record<string, string>;
    helpersTolerations?: K8s["core.v1.Toleration"][];
  },
): FdbClusterResources {
  const labels = {
    "app.kubernetes.io/name": baseName,
    "app.kubernetes.io/instance": baseName,
    ...extraLabels,
  };

  const connectionStringConfigMapRef: K8s["core.v1.ConfigMapKeySelector"] = {
    name: `${baseName}-connection-string`,
    key: "connectionString",
  };

  const currentImage = currentGeneration.image ?? fdbImage;
  const nextImage = nextGeneration?.image ?? fdbImage;

  const backupDeployment = backup
    ? createFdbBackupDeployment({
      replicas: backup.podCount,
      baseName,
      processCountPerPod: backup.agentCountPerPod,
      baseLabels: labels,
      connectionStringConfigMapRef,
      volumeMounts: backup.volumeMounts,
      volumes: backup.volumes,
      image: currentImage,
      imagePullPolicy,
      topologySpreadConstraints: currentGeneration.stateless.topologySpreadConstraints,
      nodeSelector: helpersNodeSelector,
      tolerations: helpersTolerations,
    })
    : undefined;

  const currentBaseName = `${baseName}${currentGeneration.id.length > 0 ? `-${currentGeneration.id}` : ""}`;
  const nextBaseName = `${baseName}${nextGeneration ? `-${nextGeneration.id}` : ""}`;

  const { services: coordinatorServices, statefulSets: coordinatorStatefulSets } = createFdbStatefulResources({
    baseName,
    baseLabels: labels,
    configs: coordinators,
    connectionStringConfigMapRef,
    image: currentImage,
    imagePullPolicy,
    locality,
  });

  const { services: currentStatefulServices, statefulSets: currentStatefulSets } = createFdbStatefulResources({
    baseName: currentBaseName,
    baseLabels: labels,
    configs: currentGeneration.stateful,
    connectionStringConfigMapRef,
    image: currentImage,
    imagePullPolicy,
    locality,
  });

  const { services: nextStatefulServices, statefulSets: nextStatefulSets } = nextGeneration
    ? createFdbStatefulResources({
      baseName: nextBaseName,
      baseLabels: labels,
      configs: nextGeneration.stateful,
      connectionStringConfigMapRef,
      image: nextImage,
      imagePullPolicy,
      locality,
    })
    : { services: [], statefulSets: [] };

  const currentStateless = currentGeneration.stateless;
  const nextStateless = nextGeneration?.stateless;

  const currentGrvProxyDeployment = (currentStateless.mode === "prod")
    ? createFdbStatelessDeployment({
      baseName: currentBaseName,
      processClass: "grv_proxy",
      replicas: currentStateless.grvProxyCount,
      baseLabels: labels,
      connectionStringConfigMapRef,
      port: 4500,
      image: currentImage,
      imagePullPolicy,
      nodeSelector: currentStateless.nodeSelector,
      tolerations: currentStateless.tolerations,
      resourceRequirements: currentStateless.resourceRequirements,
      locality,
      args: currentStateless.args,
      topologySpreadConstraints: currentStateless.topologySpreadConstraints,
    })
    : undefined;

  const nextGrvProxyDeployment = (nextStateless?.mode === "prod")
    ? createFdbStatelessDeployment({
      baseName: nextBaseName,
      processClass: "grv_proxy",
      replicas: nextStateless.grvProxyCount,
      baseLabels: labels,
      connectionStringConfigMapRef,
      port: 4500,
      image: nextImage,
      imagePullPolicy,
      nodeSelector: nextStateless.nodeSelector,
      tolerations: nextStateless.tolerations,
      resourceRequirements: nextStateless.resourceRequirements,
      locality,
      args: nextStateless.args,
      topologySpreadConstraints: nextStateless.topologySpreadConstraints,
    })
    : undefined;

  const currentCommitProxyDeployment = (currentStateless.mode === "prod")
    ? createFdbStatelessDeployment({
      baseName: currentBaseName,
      processClass: "commit_proxy",
      replicas: currentStateless.commitProxyCount,
      baseLabels: labels,
      connectionStringConfigMapRef,
      port: 4500,
      image: currentImage,
      imagePullPolicy,
      nodeSelector: currentStateless.nodeSelector,
      tolerations: currentStateless.tolerations,
      resourceRequirements: currentStateless.resourceRequirements,
      locality,
      args: currentStateless.args,
      topologySpreadConstraints: currentStateless.topologySpreadConstraints,
    })
    : undefined;

  const nextCommitProxyDeployment = (nextStateless?.mode === "prod")
    ? createFdbStatelessDeployment({
      baseName: nextBaseName,
      processClass: "commit_proxy",
      replicas: nextStateless.commitProxyCount,
      baseLabels: labels,
      connectionStringConfigMapRef,
      port: 4500,
      image: nextImage,
      imagePullPolicy,
      nodeSelector: nextStateless.nodeSelector,
      tolerations: nextStateless.tolerations,
      resourceRequirements: nextStateless.resourceRequirements,
      locality,
      args: nextStateless.args,
      topologySpreadConstraints: nextStateless.topologySpreadConstraints,
    })
    : undefined;

  const currentStatelessDeployment = createFdbStatelessDeployment({
    baseName: currentBaseName,
    processClass: "stateless",
    replicas: (currentStateless.mode === "prod")
      ? currentStateless.resolverCount + currentStateless.standbyCount + 4
      : currentStateless.count ?? 1,
    baseLabels: labels,
    connectionStringConfigMapRef,
    port: 4500,
    image: currentImage,
    imagePullPolicy,
    nodeSelector: currentStateless.nodeSelector,
    tolerations: currentStateless.tolerations,
    resourceRequirements: currentStateless.resourceRequirements,
    locality,
    args: currentStateless.args,
    topologySpreadConstraints: currentStateless.topologySpreadConstraints,
  });

  const nextStatelessDeployment = nextStateless
    ? createFdbStatelessDeployment({
      baseName: nextBaseName,
      processClass: "stateless",
      replicas: (nextStateless.mode === "prod")
        ? nextStateless.resolverCount + nextStateless.standbyCount + 4
        : nextStateless.count ?? 1,
      baseLabels: labels,
      connectionStringConfigMapRef,
      port: 4500,
      image: nextImage,
      imagePullPolicy,
      nodeSelector: nextStateless.nodeSelector,
      tolerations: nextStateless.tolerations,
      resourceRequirements: nextStateless.resourceRequirements,
      locality,
      args: nextStateless.args,
      topologySpreadConstraints: nextStateless.topologySpreadConstraints,
    })
    : undefined;

  const coordinatorServiceNames = Object
    .entries(coordinators)
    .filter(([_, cfg]) =>
      cfg.processClass === "coordinator" &&
      cfg.servers.filter((s) => !s.excluded).length > 0
    )
    .map(([id, _]) => `${baseName}-${id}`);

  const excludedServiceEndpoints: FdbDatabaseConfig["excludedServiceEndpoints"] = Object
    .entries(currentGeneration.stateful)
    .flatMap(([id, cfg]) =>
      cfg
        .servers
        .filter((s) => nextGeneration !== undefined || s.excluded)
        .map((s) => ({
          name: `${baseName}-${id}`,
          port: s.port,
        }))
    );

  const logCount = Object
    .entries((nextGeneration ?? currentGeneration).stateful)
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

  const currentGrvProxyCount = currentStateless.mode === "prod"
    ? currentStateless.grvProxyCount
    : currentStateless.count ?? 1;
  const currentCommitProxyCount = currentStateless.mode === "prod"
    ? currentStateless.commitProxyCount
    : currentStateless.count ?? 1;
  const currentResolverCount = currentStateless.mode === "prod" ? currentStateless.resolverCount : 1;

  const nextGrvProxyCount = nextStateless
    ? (nextStateless.mode === "prod" ? nextStateless.grvProxyCount : nextStateless.count ?? 1)
    : undefined;
  const nextCommitProxyCount = nextStateless
    ? (nextStateless.mode === "prod" ? nextStateless.commitProxyCount : nextStateless.count ?? 1)
    : undefined;
  const nextResolverCount = nextStateless
    ? (nextStateless.mode === "prod" ? nextStateless.resolverCount : 1)
    : undefined;

  const databaseConfig: FdbDatabaseConfig = {
    storageEngine,
    redundancyMode,
    perpetualStorageWiggle,
    perpetualStorageWiggleLocality,
    storageMigrationType,
    tenantMode,
    logCount,
    grvProxyCount: nextGrvProxyCount ?? currentGrvProxyCount,
    commitProxyCount: nextCommitProxyCount ?? currentCommitProxyCount,
    resolverCount: nextResolverCount ?? currentResolverCount,
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
    coordinatorServices,
    coordinatorStatefulSets,
    currentStatefulServices,
    nextStatefulServices,
    currentStatefulSets,
    nextStatefulSets,
    currentGrvProxyDeployment,
    nextGrvProxyDeployment,
    currentCommitProxyDeployment,
    nextCommitProxyDeployment,
    currentStatelessDeployment,
    nextStatelessDeployment,
    createConnectionString,
    configure,
    syncConnectionString,
    exporter,
  };
}
