import {
  defineChartInstance,
  IoK8sApiCoreV1Volume,
} from "../../deps/helmet.ts";
import { IoK8sApiCoreV1ConfigMapKeySelector } from "../../deps/helmet.ts";
import { createFdbConfigureResources } from "./lib/configurator/fdb_configure.ts";
import {
  createFdbCreateConnectionStringResources,
} from "./lib/configurator/fdb_create_connection_string.ts";
import {
  createFdbSyncConnectionStringResources,
} from "./lib/configurator/fdb_sync_connection_string.ts";
import createResourceGroup from "../resource_group/resource_group.ts";
import {
  createFdbStatefulResources,
  FdbStatefulConfig,
} from "./lib/fdb_stateful.ts";
import { createFdbStatelessResources } from "./lib/fdb_stateless.ts";
import { FdbDatabaseConfig } from "../../apps/fdb_configurator/libs/types.ts";
import { createFdbExporterResources } from "./lib/fdb_exporter.ts";
import { fdbVersion } from "./lib/fdb_images.ts";

export default defineChartInstance(
  (
    {
      storageEngine,
      redundancyMode,
      stateless,
      stateful,
      baseName,
      namespace,
      createNamespace,
      dataVolumeFactory,
    }: {
      baseName: string;
      namespace: string;
      createNamespace: boolean;
      storageEngine: FdbDatabaseConfig["storageEngine"];
      redundancyMode: FdbDatabaseConfig["redundancyMode"];
      stateless: {
        proxyCount: number;
        resolverCount: number;
        standbyCount: number;
      };
      stateful: Record<string, FdbStatefulConfig>;
      dataVolumeFactory: (name: string) => Omit<IoK8sApiCoreV1Volume, "name">;
    },
  ) => {
    const labels = {
      "app.kubernetes.io/name": baseName,
      "app.kubernetes.io/instance": baseName,
    };

    const connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector = {
      name: `${baseName}-connection-string`,
      key: "connectionString",
    };

    const statefulResources = createFdbStatefulResources({
      baseName,
      baseLabels: labels,
      configs: stateful,
      connectionStringConfigMapRef,
      dataVolumeFactory,
    });

    const proxyResources = createFdbStatelessResources({
      baseName,
      processClass: "proxy",
      replicas: stateless.proxyCount,
      baseLabels: labels,
      connectionStringConfigMapRef,
      port: 4500,
    });

    const statelessResources = createFdbStatelessResources({
      baseName,
      processClass: "stateless",
      // The extra 4 are: master + cluster_controller + ratekeeper + data_distributor
      replicas: stateless.resolverCount + stateless.standbyCount + 4,
      baseLabels: labels,
      connectionStringConfigMapRef,
      port: 4500,
      // data_distributor needs more than the default 8GiB limit
      // when the cluster is hammered with > 1M writes / s
      processMemoryGiBs: 12,
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
        r.processClass === "log"
          ? r.servers.filter((s) => !s.excluded).length
          : 0
      )
      .reduce((s, c) => s + c, 0);

    const createConnectionStringResources =
      createFdbCreateConnectionStringResources({
        baseLabels: labels,
        baseName,
        namespace,
        connectionStringConfigMapRef,
        coordinatorServiceNames: coordinatorServiceNames,
      });

    const databaseConfig: FdbDatabaseConfig = {
      storageEngine,
      redundancyMode,
      logCount,
      proxyCount: stateless.proxyCount,
      resolverCount: stateless.resolverCount,
      coordinatorServiceNames,
      excludedServiceEndpoints,
    };

    const configureResources = createFdbConfigureResources({
      baseLabels: labels,
      baseName,
      namespace,
      connectionStringConfigMapRef,
      databaseConfig,
    });

    const syncConnectionStringResources =
      createFdbSyncConnectionStringResources({
        baseLabels: labels,
        releaseName: baseName,
        namespace,
        connectionStringConfigMapRef,
      });

    const exporterResources = createFdbExporterResources({
      name: `${baseName}-exporter`,
      baseLabels: labels,
      dedupProxyImage:
        "shopstic/dedup-proxy:cde8f002fee7962e1da76e9243a19d3409e93299",
      connectionStringConfigMapRef,
    });

    return createResourceGroup({
      name: baseName,
      namespace,
      createNamespace,
      version: fdbVersion,
      labels,
      resources: [
        ...statefulResources,
        ...proxyResources,
        ...statelessResources,
        ...createConnectionStringResources,
        ...configureResources,
        ...syncConnectionStringResources,
        ...exporterResources,
      ],
    });
  },
);
