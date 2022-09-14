import { Type } from "../../../../deps/typebox.ts";
import { createCliAction, ExitCode } from "../../../../deps/cli_utils.ts";
import {
  fetchCoordinatorEndpointsFromServiceNames,
  readCurrentNamespace,
  updateConnectionStringConfigMap,
} from "../utils.ts";
import { NonEmptyString } from "../types.ts";
import { commandWithTimeout } from "../../../../libs/utils.ts";
import { Logger } from "../../../../libs/logger.ts";

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
  Type.Object({
    configMapKey: NonEmptyString(),
    configMapName: NonEmptyString(),
    serviceNames: Type.Union([Type.Array(NonEmptyString()), NonEmptyString()]),
  }),
  async (
    {
      configMapKey,
      configMapName,
      serviceNames,
    },
  ) => {
    const serviceNameArray = typeof serviceNames === "string" ? [serviceNames] : serviceNames;

    const namespace = await readCurrentNamespace();

    const hasExistingConfigMap = await (async () => {
      const cmd = [
        "kubectl",
        "get",
        `configmap/${configMapName}`,
        "-n",
        namespace,
      ];
      const child = Deno.run({
        cmd: commandWithTimeout(cmd, 5),
        stdout: "null",
        stderr: "piped",
      });

      const stderr = new TextDecoder().decode(await child.stderrOutput());
      const { code } = await child.status();

      if (code === 0) {
        return true;
      } else if (stderr.indexOf("not found") !== -1) {
        return false;
      }

      logger.error({ msg: "Command failed", cmd, code, stderr });
      throw new Error("Command failed");
    })();

    if (hasExistingConfigMap) {
      logger.info({ msg: "ConfigMap already exists, nothing to do", configMapName });
      return ExitCode.Zero;
    }

    const coordinatorEndpoints = await fetchCoordinatorEndpointsFromServiceNames(serviceNameArray);
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
