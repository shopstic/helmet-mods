import { captureExec, inheritExec, StdInputBehavior } from "../../../deps/exec_utils.ts";
import { validate } from "../../../deps/validation_utils.ts";
import { memoizePromise } from "../../../deps/async_utils.ts";
import { Static, TSchema, Type } from "../../../deps/typebox.ts";
import { FdbDatabaseConfig, FdbStatus, FdbStatusSchema } from "./types.ts";
import { FdbDatabaseConfigSchema } from "./types.ts";
import { commandWithTimeout } from "../../../libs/utils.ts";
import { createK8sConfigMap } from "../../../deps/helmet.ts";
import { Logger } from "../../../libs/logger.ts";

const logger = new Logger({ ctx: "utils" });

function trimFdbCliOutput(output: string): string {
  let newLineCount = 0;

  for (let i = 0; i < output.length; i++) {
    if (output.charAt(i) === "\n") {
      newLineCount++;
    }

    // >>> option on PRIORITY_SYSTEM_IMMEDIATE
    // Option enabled for all transactions
    // >>> xxxxxxxxx
    if (newLineCount === 3) {
      return output.substr(i + 1);
    }
  }

  throw new Error(`Invalid fdbcli output: ${output}`);
}

export async function fdbcliCaptureExec(
  command: string,
  timeoutSeconds = 30,
): Promise<string> {
  try {
    const captured = (await captureExec(
      {
        cmd: commandWithTimeout(
          toFdbcliCommand(command),
          timeoutSeconds,
        ),
      },
    )).out;

    return trimFdbCliOutput(captured);
  } catch (e) {
    if (e.message.indexOf("Command return non-zero status of: 124") !== -1) {
      throw new Error(
        `Timed out executing fdbcli with '${command}' after ${timeoutSeconds}s`,
      );
    } else {
      throw e;
    }
  }
}

export async function fdbcliInheritExec(
  command: string,
  timeoutSeconds = 30,
): Promise<void> {
  try {
    const fdbcliCmd = toFdbcliCommand(command);
    await inheritExec({
      cmd: isFinite(timeoutSeconds) ? commandWithTimeout(fdbcliCmd, timeoutSeconds) : fdbcliCmd,
    });
  } catch (e) {
    if (e.message.indexOf("Command return non-zero status of: 124") !== -1) {
      throw new Error(
        `Timed out executing fdbcli with '${command}' after ${timeoutSeconds}s`,
      );
    } else {
      throw e;
    }
  }
}

export async function fetchStatus(
  timeoutMs = 30000,
): Promise<FdbStatus> {
  const json = await fdbcliCaptureExec("status json", timeoutMs);

  const parsed = (() => {
    try {
      return JSON.parse(json);
    } catch (e) {
      logger.error({ error: json });
      throw e;
    }
  })();

  const statusValidation = validate(FdbStatusSchema, parsed);

  if (!statusValidation.isSuccess) {
    const errorMessage = "FDB status JSON payload failed schema validation";
    logger.error({ msg: errorMessage, payload: json, errors: statusValidation.errors });
    throw new Error(errorMessage);
  }

  return statusValidation.value;
}

export function toFdbcliCommand(command: string) {
  return [
    "fdbcli",
    "--no-status",
    "--exec",
    `option on PRIORITY_SYSTEM_IMMEDIATE; ${command}`,
  ];
}

export function toRootElevatedCommand(command: string[]) {
  return [
    "nsenter",
    "-t",
    "1",
    "-m",
    "-u",
    "-n",
    "-i",
    ...command,
  ];
}

export const readCurrentNamespace = memoizePromise(() =>
  Deno.readTextFile(
    "/var/run/secrets/kubernetes.io/serviceaccount/namespace",
  )
);

export async function readClusterConfig(
  configFile: string,
): Promise<FdbDatabaseConfig> {
  const raw = await Deno.readTextFile(configFile);
  const configJson = JSON.parse(raw);
  const configValidation = validate(
    FdbDatabaseConfigSchema,
    configJson,
  );

  if (!configValidation.isSuccess) {
    logger.error({ msg: "Invalid cluster config", config: configJson, errors: configValidation.errors });
    throw new Error("Invalid cluster config");
  }

  return configValidation.value;
}

export const ServiceSpecSchema = Type.PartialObject({
  clusterIP: Type.String({ format: "ipv4" }),
  ports: Type.Array(
    Type.PartialObject({
      port: Type.Number(),
    }),
    { minItems: 1 },
  ),
});

export type ServiceSpec = Static<typeof ServiceSpecSchema>;

export async function kubectlInherit({
  args,
  stdin,
  timeoutSeconds = 5,
}: {
  args: string[];
  stdin?: StdInputBehavior;
  timeoutSeconds?: number;
}) {
  return await inheritExec({
    cmd: commandWithTimeout([
      "kubectl",
      ...args,
    ], timeoutSeconds),
    stdin,
  });
}

export async function kubectlCapture({
  args,
  stdin,
  timeoutSeconds = 5,
}: {
  args: string[];
  stdin?: StdInputBehavior;
  timeoutSeconds?: number;
}) {
  return (await captureExec({
    cmd: commandWithTimeout([
      "kubectl",
      ...args,
    ], timeoutSeconds),
    stdin,
  })).out;
}

export async function kubectlGetJson<T extends TSchema>({
  args,
  schema,
  timeoutSeconds,
}: {
  args: string[];
  schema: T;
  timeoutSeconds?: number;
}): Promise<Static<T>> {
  const fullArgs = ["get", ...args];

  const output = await kubectlCapture({
    args: fullArgs,
    timeoutSeconds,
  });

  const json = JSON.parse(output);
  const validation = validate(schema, json);

  if (!validation.isSuccess) {
    const errorMessage = `'kubectl ${fullArgs.join(" ")}' output failed schema validation`;
    logger.error({ msg: errorMessage, output: json, errors: validation.errors });
    throw new Error(errorMessage);
  }

  return validation.value;
}

export async function fetchServiceSpecs(
  serviceNames: string[],
): Promise<ServiceSpec[]> {
  const namespace = await readCurrentNamespace();
  const promises = serviceNames.map((name) => {
    return kubectlGetJson({
      args: [
        `service/${name}`,
        "-n",
        namespace,
        "-o=jsonpath={.spec}",
      ],
      schema: ServiceSpecSchema,
    });
  });

  return await Promise.all(promises);
}

export async function fetchCoordinatorEndpointsFromServiceNames(
  serviceNames: string[],
): Promise<string[]> {
  const specs = await fetchServiceSpecs(serviceNames);

  return specs.map((spec) => `${spec.clusterIP}:${spec.ports[0]!.port}`);
}

export async function updateConnectionStringConfigMap(
  { configMapKey, configMapName, connectionString }: {
    configMapKey: string;
    configMapName: string;
    connectionString: string;
  },
): Promise<void> {
  const namespace = await readCurrentNamespace();
  const configMap = createK8sConfigMap({
    metadata: {
      name: configMapName,
      namespace,
    },
    data: {
      [configMapKey]: connectionString,
    },
  });

  await kubectlInherit({
    args: ["apply", "-f", "-"],
    stdin: {
      pipe: JSON.stringify(configMap),
    },
  });
}
