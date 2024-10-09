import { delay } from "../../../../deps/async_utils.ts";
import { createCliAction } from "../../../../deps/cli_utils.ts";
import { Type } from "../../../../deps/typebox.ts";
import { Logger } from "../../../../libs/logger.ts";
import { NonEmptyString } from "../types.ts";
import { fdbcliCaptureExec, updateConnectionStringConfigMap } from "../utils.ts";

const logger = new Logger();
const FDB_CLUSTER_FILE = "FDB_CLUSTER_FILE";
const connectionStringResultRegex = /`\\xff\\xff\/connection_string' is `([^']+)'/;

export default createCliAction(
  {
    configMapKey: NonEmptyString(),
    configMapName: NonEmptyString(),
    updateIntervalMs: Type.Number(),
  },
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

    logger.info({ msg: "Connection string sync loop started with last value", lastConnectionString });

    while (true) {
      try {
        logger.debug({ msg: "Getting current connection string" });
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
          logger.debug({ msg: "Connection string hasn't changed", connectionString });
        } else {
          logger.info({
            msg: "Connection string changed",
            lastConnectionString,
            connectionString,
          });
          logger.info(
            { msg: "Going to update ConfigMap", configMapName, configMapKey, connectionString },
          );

          await updateConnectionStringConfigMap({
            configMapKey,
            configMapName,
            connectionString,
          });

          logger.info({
            msg: "ConfigMap updated successfully!",
            configMapName,
          });

          lastConnectionString = connectionString;
        }
      } catch (error) {
        logger.error({ error });
      }

      await delay(updateIntervalMs);
    }
  },
);
