import { createCliAction, ExitCode } from "../../../../deps/cli_utils.ts";
import {
  fetchCoordinatorEndpointsFromServiceNames,
  readCurrentNamespace,
  updateConnectionStringConfigMap,
} from "../utils.ts";
import { commandWithTimeout } from "../../../../libs/utils.ts";
import { Logger } from "../../../../libs/logger.ts";
import { Arr, NonEmpStr } from "../../../../deps/schema.ts";

const logger = new Logger();

function generateString(length: number): string {
  return Array
    .from(
      Array(length),
      () => Math.floor(Math.random() * 36).toString(36),
    )
    .join("");
}

export default createCliAction(
  {
    configMapKey: NonEmpStr(),
    configMapName: NonEmpStr(),
    serviceNames: Arr(NonEmpStr()),
  },
  async (
    {
      configMapKey,
      configMapName,
      serviceNames,
    },
  ) => {
    const namespace = await readCurrentNamespace();

    const hasExistingConfigMap = await (async () => {
      const cmd = [
        "kubectl",
        "get",
        `configmap/${configMapName}`,
        "-n",
        namespace,
      ];

      const withTimeout = commandWithTimeout(cmd, 5);
      const output = await new Deno.Command(withTimeout[0], {
        args: withTimeout.slice(1),
        stdout: "null",
        stderr: "piped",
      }).output();

      const stderr = new TextDecoder().decode(output.stderr);

      if (output.code === 0) {
        return true;
      } else if (stderr.indexOf("not found") !== -1) {
        return false;
      }

      logger.error({ msg: "Command failed", cmd, output });
      throw new Error("Command failed");
    })();

    if (hasExistingConfigMap) {
      logger.info({ msg: "ConfigMap already exists, nothing to do", configMapName });
      return ExitCode.Zero;
    }

    const coordinatorEndpoints = await fetchCoordinatorEndpointsFromServiceNames(serviceNames);
    const clusterDescription = generateString(32);
    const clusterId = generateString(8);
    const connectionString = `${clusterDescription}:${clusterId}@${coordinatorEndpoints.join(",")}`;

    logger.info({ msg: "Going to create ConfigMap", configMapKey, configMapName, connectionString });

    await updateConnectionStringConfigMap({
      configMapKey,
      configMapName,
      connectionString,
    });

    logger.info({ msg: "ConfigMap created successfully!", configMapName });

    return ExitCode.Zero;
  },
);
