import { memoizePromise } from "../../../../deps/async_utils.ts";
import { createCliAction, ExitCode } from "../../../../deps/cli_utils.ts";
import { Type } from "../../../../deps/typebox.ts";
import { Logger } from "../../../../libs/logger.ts";
import { FdbDatabaseConfig, FdbStatus, FdbStatusProcess, NonEmptyString } from "../types.ts";

import {
  fdbcliInheritExec,
  fetchCoordinatorEndpointsFromServiceNames,
  fetchPodIpsByLabels,
  fetchServiceEndpointsByLabels,
  fetchServiceSpecs,
  fetchStatus,
  readClusterConfig,
} from "../utils.ts";

const logger = new Logger();

async function configureCoordinators(
  status: FdbStatus,
  config: FdbDatabaseConfig,
): Promise<boolean> {
  const { coordinatorServiceNames } = config;
  const currentCoordinators = status.client.coordinators.coordinators
    .map(({ address }) => address)
    .sort()
    .join(" ");

  const coordinators = (await fetchCoordinatorEndpointsFromServiceNames(coordinatorServiceNames))
    .sort()
    .join(" ");

  if (currentCoordinators !== coordinators) {
    logger.info({
      msg: `Coordinators changed, going to configure...`,
      currentCoordinators,
      coordinators,
    });
    await fdbcliInheritExec(`coordinators ${coordinators}`);
  }

  return true;
}

async function configureDatabase(
  status: FdbStatus,
  config: FdbDatabaseConfig,
): Promise<boolean> {
  const currentClusterConfig = status.cluster.configuration;

  const {
    logCount,
    grvProxyCount,
    commitProxyCount,
    resolverCount,
    redundancyMode,
    storageEngine,
    perpetualStorageWiggle,
    perpetualStorageWiggleLocality,
    storageMigrationType,
    tenantMode,
  } = config;

  logger.info({ msg: "Cluster configs", currentClusterConfig, config });

  if (
    !currentClusterConfig ||
    currentClusterConfig.logs !== logCount ||
    currentClusterConfig.grv_proxies !== grvProxyCount ||
    currentClusterConfig.commit_proxies !== commitProxyCount ||
    currentClusterConfig.resolvers !== resolverCount ||
    currentClusterConfig.redundancy_mode !== redundancyMode ||
    currentClusterConfig.storage_engine !== storageEngine ||
    currentClusterConfig.perpetual_storage_wiggle !== perpetualStorageWiggle ||
    currentClusterConfig.perpetual_storage_wiggle_locality !== perpetualStorageWiggleLocality ||
    currentClusterConfig.storage_migration_type !== storageMigrationType ||
    currentClusterConfig.tenant_mode !== tenantMode
  ) {
    const recoveryState = status.cluster.recovery_state?.name || "unknown";
    const createNew = recoveryState === "configuration_never_created";

    if (status.client.database_status.available || createNew) {
      const cmd = [
        `configure${createNew ? " new" : ""}`,
        redundancyMode,
        storageEngine,
        `resolvers=${resolverCount}`,
        `logs=${logCount}`,
        `perpetual_storage_wiggle=${perpetualStorageWiggle}`,
        `perpetual_storage_wiggle_locality=${perpetualStorageWiggleLocality}`,
        `storage_migration_type=${storageMigrationType}`,
        `tenant_mode=${tenantMode}`,
        `grv_proxies=${grvProxyCount}`,
        `commit_proxies=${commitProxyCount}`,
      ].join(" ");

      logger.info({ msg: `Configuration changed, going to configure`, cmd });

      await fdbcliInheritExec(cmd);
    } else {
      const recoveryStateDescription = status.cluster.recovery_state?.description || "Unknown";

      logger.error({ msg: "Failed configuring database!", recoveryState, recoveryStateDescription });
      logger.info({ msg: "Attempting to fetch status details to help debugging..." });

      await fdbcliInheritExec("status details");

      return false;
    }
  } else {
    logger.info({ msg: "No configuration change, nothing to do" });
  }

  return true;
}

interface FdbProcessInfo {
  id: string;
  processClass: FdbStatusProcess["class_type"];
  machineId: string | undefined;
  address: string;
}

async function determineProcessInclusionExclusion(
  status: FdbStatus,
  config: FdbDatabaseConfig,
) {
  if (!status.client.coordinators.quorum_reachable) {
    logger.error({ msg: "Quorum not reachable, going to skip" });
    return null;
  }

  const { excludedServiceEndpoints, excludedPodLabels, excludedServiceLabels } = config;

  const desiredExcludedAddresses = await (async () => {
    const excludedAddresses: string[] = [];

    if (excludedServiceEndpoints.length !== 0) {
      logger.info({
        msg: `There are ${excludedServiceEndpoints.length} desired excluded service endpoints`,
        excludedServiceEndpoints,
      });

      const serviceSpecs = await fetchServiceSpecs(
        excludedServiceEndpoints.map((e) => e.name),
      );

      excludedAddresses.push.apply(
        excludedAddresses,
        serviceSpecs.map((s, i) => `${s.clusterIP}:${excludedServiceEndpoints[i].port}`),
      );
    }

    if (excludedServiceLabels.length !== 0) {
      for (const labels of excludedServiceLabels) {
        logger.info({
          msg: "Fetching excluded services by labels",
          labels,
        });

        const serviceEndpoints = await fetchServiceEndpointsByLabels(labels);
        excludedAddresses.push.apply(excludedAddresses, serviceEndpoints);
      }
    }

    if (excludedPodLabels.length !== 0) {
      for (const labels of excludedPodLabels) {
        logger.info({
          msg: "Fetching excluded pods by labels",
          labels,
        });

        const podIps = await fetchPodIpsByLabels(labels);
        excludedAddresses.push.apply(excludedAddresses, podIps.map((podIp) => `${podIp}:4500`));
      }
    }

    return excludedAddresses;
  })();

  const desiredExcludedAddressSet = new Set(desiredExcludedAddresses);

  const processList = Object.values(
    status.cluster.processes || {},
  );

  const currentAddressSet: Set<string> = new Set(
    processList.map((p) => p.address),
  );

  const currentlyExcludedAddresses = processList
    .filter((p) => p.excluded)
    .map((p) => p.address);

  const currentlyExcludedAddressSet = new Set(currentlyExcludedAddresses);

  const processByAddressMap = Object.fromEntries(
    Object.entries(status.cluster.processes || {})
      .map(([id, p]) => [p.address, {
        id,
        processClass: p.class_type,
        machineId: p.machine_id,
        address: p.address,
      }]),
  );

  const nonexistentExcludedAddresses = desiredExcludedAddresses.filter((a) => !currentAddressSet.has(a));
  const alreadyExcludedAddresses = desiredExcludedAddresses.filter((a) => currentlyExcludedAddressSet.has(a));
  const toBeExcludedAddresses = desiredExcludedAddresses.filter((a) =>
    currentAddressSet.has(a) && !currentlyExcludedAddressSet.has(a)
  );
  const toBeIncludedAddresses = currentlyExcludedAddresses.filter((a) => !desiredExcludedAddressSet.has(a));

  return {
    processByAddressMap,
    nonexistentExcludedAddresses,
    alreadyExcludedAddresses,
    toBeExcludedAddresses,
    toBeIncludedAddresses,
  };
}

export default createCliAction(
  Type.Object({
    configFile: NonEmptyString(),
  }),
  async (
    {
      configFile,
    },
  ) => {
    const config = await readClusterConfig(configFile);
    const status = await fetchStatus();
    const memoizedProcessInclusionExclusion = memoizePromise(() => determineProcessInclusionExclusion(status, config));

    const steps = [
      {
        name: "Configure coordinators",
        fn: configureCoordinators,
      },
      {
        name: "Include processes",
        fn: async () => {
          const ret = await memoizedProcessInclusionExclusion();

          if (ret === null) {
            return false;
          }

          const { processByAddressMap, toBeIncludedAddresses } = ret;

          if (toBeIncludedAddresses.length > 0) {
            const toBeIncludedProcesses = toBeIncludedAddresses.map((a) => processByAddressMap[a]);

            logger.info({
              msg: `The following ${toBeIncludedAddresses.length} addresses will be included back`,
              addresses: toBeIncludedProcesses,
            });

            await fdbcliInheritExec(
              `include ${toBeIncludedAddresses.join(" ")}`,
            );
          }

          return true;
        },
      },
      {
        name: "Configure database",
        fn: configureDatabase,
      },
      {
        name: "Exclude processes",
        fn: async () => {
          const ret = await memoizedProcessInclusionExclusion();

          if (ret === null) {
            return false;
          }

          const { processByAddressMap, nonexistentExcludedAddresses, alreadyExcludedAddresses, toBeExcludedAddresses } =
            ret;

          if (nonexistentExcludedAddresses.length > 0) {
            logger.warn({
              message:
                `There are ${nonexistentExcludedAddresses.length} addresses to be excluded but they don't exist in FDB status`,
              addresses: nonexistentExcludedAddresses.map((a) => processByAddressMap[a]),
            });
          }

          if (alreadyExcludedAddresses.length > 0) {
            logger.info({
              msg: `The following ${alreadyExcludedAddresses.length} addresses have already been previously excluded`,
              addresses: alreadyExcludedAddresses.map((a) => processByAddressMap[a]),
            });
          }

          if (toBeExcludedAddresses.length === 0) {
            logger.info({ msg: "No new address to be excluded" });
          } else {
            const toBeExcludedProcesses = toBeExcludedAddresses.map((a) => processByAddressMap[a]);

            logger.info({
              msg: "Going to exclude",
              addresses: toBeExcludedProcesses,
            });

            if (!status.client.database_status.available) {
              logger.error({ msg: "Database is not available, going to skip excluding" });
              return false;
            } else {
              await fdbcliInheritExec(
                `exclude FORCE ${toBeExcludedAddresses.join(" ")}`,
                Infinity,
              );
            }
          }

          return true;
        },
      },
    ];

    for (const { name, fn } of steps) {
      logger.info({ msg: "Running step", name });

      if (!(await fn(status, config))) {
        logger.error({ msg: `Step failed, going to stop`, name });
        return ExitCode.One;
      }
    }

    return ExitCode.Zero;
  },
);
