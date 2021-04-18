import { delay } from "../deps/async-utils.ts";
import { createCliAction } from "../deps/cli-utils.ts";
import { Type } from "../deps/typebox.ts";
import { loggerWithContext } from "../logger.ts";
import { NonEmptyString } from "../types.ts";
import {
  fdbcliCaptureExec,
  updateConnectionStringConfigMap,
} from "../utils.ts";

const logger = loggerWithContext("main");
const FDB_CLUSTER_FILE = "FDB_CLUSTER_FILE";
const connectionStringResultRegex =
  /`\\xff\\xff\/connection_string' is `([^']+)'/;

export default createCliAction(
  Type.Object({
    configMapKey: NonEmptyString(),
    configMapName: NonEmptyString(),
    updateIntervalMs: Type.Number(),
  }),
  async (
    {
      configMapKey,
      configMapName,
      updateIntervalMs,
    },
  ) => {
    const clusterFile = Deno.env.get(FDB_CLUSTER_FILE);

    if (!clusterFile) {
      throw new Error(`${FDB_CLUSTER_FILE} env variable is not set`);
    }

    let lastConnectionString = (await Deno.readTextFile(clusterFile)).trim();

    logger.info(
      "Connection string sync loop started with last value",
      lastConnectionString,
    );

    while (true) {
      try {
        logger.debug("Getting current connection string");
        const connectionStringResult = await fdbcliCaptureExec(
          // Must issue "status minimal" here such that connection
          // string is updated timely
          `status minimal; get \\xFF\\xFF/connection_string`,
        );

        const connectionStringMatch = connectionStringResult.match(
          connectionStringResultRegex,
        );

        if (!connectionStringMatch) {
          throw new Error(
            `Connection string result doesn't match regex: ${connectionStringResult}`,
          );
        }

        const connectionString = connectionStringMatch[1];

        if (connectionString === lastConnectionString) {
          logger.debug(`Connection string hasn't changed`, connectionString);
        } else {
          logger.info(
            `Connection string changed from '${lastConnectionString}' to ${connectionString}`,
          );
          logger.info(
            `Going to update ConfigMap '${configMapName}' with data key '${configMapKey}' and value '${connectionString}'`,
          );

          await updateConnectionStringConfigMap({
            configMapKey,
            configMapName,
            connectionString,
          });

          logger.info(`ConfigMap '${configMapName}' updated successfully!`);

          lastConnectionString = connectionString;
        }
      } catch (e) {
        logger.error(e.toString());
      }

      await delay(updateIntervalMs);
    }
  },
);
