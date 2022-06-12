import { createCliAction, ExitCode } from "../../../../deps/cli_utils.ts";
import { Type } from "../../../../deps/typebox.ts";
import { loggerWithContext } from "../../../../libs/logger.ts";
import { FdbDatabaseConfig, FdbStatus, FdbStatusProcess, NonEmptyString } from "../types.ts";

import {
  fdbcliInheritExec,
  fetchCoordinatorEndpointsFromServiceNames,
  fetchServiceSpecs,
  fetchStatus,
  readClusterConfig,
} from "../utils.ts";

const logger = loggerWithContext("main");

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
    logger.info(
      `Coordinators changed from "${currentCoordinators}" to "${coordinators}", going to configure...`,
    );
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
    proxyCount,
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

  logger.info(`Current cluster config: ${JSON.stringify(currentClusterConfig)}`);
  logger.info(`Desired cluster config: ${JSON.stringify(config)}`);

  if (
    !currentClusterConfig ||
    currentClusterConfig.logs !== logCount ||
    currentClusterConfig.proxies !== proxyCount ||
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
        typeof proxyCount === "number" ? `proxies=${proxyCount}` : "",
        typeof grvProxyCount === "number" ? `grv_proxies=${grvProxyCount}` : "",
        typeof commitProxyCount === "number" ? `commit_proxies=${commitProxyCount}` : "",
      ].filter((c) => c.length > 0).join(" ");

      logger.info(`Configuration changed, going to execute: ${cmd}`);

      await fdbcliInheritExec(cmd);
    } else {
      const recoveryStateDescription = status.cluster.recovery_state?.description || "Unknown";

      logger.info("Failed configuring database!");
      logger.info(`Recovery state name: ${recoveryState}`);
      logger.info(`Recovery state description: ${recoveryStateDescription}`);
      logger.info(`Attempting to fetch status details to help debugging...`);

      await fdbcliInheritExec("status details");

      return false;
    }
  } else {
    logger.info("No configuration change, nothing to do");
  }

  return true;
}

interface FdbProcessInfo {
  id: string;
  processClass: FdbStatusProcess["class_type"];
  machineId: string | undefined;
  address: string;
}

function prettyPrintProcessInfo(
  { id, machineId, processClass, address }: FdbProcessInfo,
): string {
  return `   - machine=${
    machineId ||
    "unknown"
  } id=${id} class=${processClass} address=${address}`;
}

async function excludeAndIncludeProcesses(
  status: FdbStatus,
  config: FdbDatabaseConfig,
): Promise<boolean> {
  if (!status.client.coordinators.quorum_reachable) {
    logger.error("Quorum not reachable, going to skip");
    return false;
  }

  const { excludedServiceEndpoints } = config;

  const desiredExcludedAddresses = await (async () => {
    if (excludedServiceEndpoints.length === 0) {
      return [];
    } else {
      logger.info(
        `There are ${excludedServiceEndpoints.length} desired excluded service endpoints`,
        JSON.stringify(excludedServiceEndpoints, null, 2),
      );

      const serviceSpecs = await fetchServiceSpecs(
        excludedServiceEndpoints.map((e) => e.name),
      );

      return serviceSpecs.map((s, i) => `${s.clusterIP}:${excludedServiceEndpoints[i].port}`);
    }
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

  if (nonexistentExcludedAddresses.length > 0) {
    logger.warn(
      `There are ${nonexistentExcludedAddresses.length} addresses to be excluded but they don't exist in FDB status:\n${
        nonexistentExcludedAddresses.map((a) => prettyPrintProcessInfo(processByAddressMap[a])).join("\n")
      }`,
    );
  }

  if (alreadyExcludedAddresses.length > 0) {
    logger.info(
      `The following ${alreadyExcludedAddresses.length} addresses have already been previously excluded:\n${
        alreadyExcludedAddresses.map((a) => prettyPrintProcessInfo(processByAddressMap[a])).join("\n")
      }`,
    );
  }

  if (toBeIncludedAddresses.length > 0) {
    logger.info(
      `The following ${toBeIncludedAddresses.length} addresses will be included back:\n${
        toBeIncludedAddresses.map((a) => prettyPrintProcessInfo(processByAddressMap[a])).join("\n")
      }`,
    );

    await fdbcliInheritExec(`include ${toBeIncludedAddresses.join(" ")}`);
  }

  if (toBeExcludedAddresses.length === 0) {
    logger.info("No new address to be excluded");
  } else {
    logger.info(
      `Going to exclude:\n${
        toBeExcludedAddresses.map((a) => prettyPrintProcessInfo(processByAddressMap[a])).join("\n")
      }`,
    );

    if (!status.client.database_status.available) {
      logger.error("Database is not available, going to skip excluding");
    } else {
      await fdbcliInheritExec(
        `exclude no_wait ${toBeExcludedAddresses.join(" ")}`,
      );
    }
  }

  return true;
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
    const steps = [
      {
        name: "Configure coordinators",
        fn: configureCoordinators,
      },
      {
        name: "Exclude and include processes",
        fn: excludeAndIncludeProcesses,
      },
      {
        name: "Configure database",
        fn: configureDatabase,
      },
    ];

    for (const { name, fn } of steps) {
      logger.info(
        `Running step: '${name}' --------------------------------------------`,
      );

      if (!(await fn(status, config))) {
        logger.error(`Step ${name} failed, going to stop`);
        return ExitCode.One;
      }
    }

    return ExitCode.Zero;
  },
);
