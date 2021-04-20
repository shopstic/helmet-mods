import { captureExec, inheritExec } from "../../../deps/exec_utils.ts";
import { validate } from "../../../deps/validation_utils.ts";
import { memoizePromise } from "../../../deps/async_utils.ts";
import {
  Static,
  TObject,
  TProperties,
  TSchema,
  Type,
} from "../../../deps/typebox.ts";
import { createK8sConfigMap } from "../../../deps/k8s_utils.ts";
import { FdbDatabaseConfig, FdbStatus, FdbStatusSchema } from "./types.ts";
import { FdbDatabaseConfigSchema } from "./types.ts";
import { loggerWithContext } from "../../../libs/logger.ts";

const logger = loggerWithContext("utils");

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

export function commandWithTimeout(command: string[], timeoutSeconds: number) {
  return ["timeout", "-k", "0", `${timeoutSeconds}s`, ...command];
}

export async function fdbcliCaptureExec(
  command: string,
  timeoutSeconds = 30,
): Promise<string> {
  try {
    const captured = await captureExec(
      {
        run: {
          cmd: commandWithTimeout(
            toFdbcliCommand(command),
            timeoutSeconds,
          ),
        },
      },
    );

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
    await inheritExec(
      {
        run: {
          cmd: commandWithTimeout(toFdbcliCommand(command), timeoutSeconds),
        },
      },
    );
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
      logger.error(json);
      throw new Error(`Failed parsing status JSON`);
    }
  })();

  const statusValidation = validate(FdbStatusSchema, parsed);

  if (!statusValidation.isSuccess) {
    logger.error(json);
    throw new Error(
      `FDB status JSON payload failed schema validation: ${
        JSON.stringify(statusValidation.errors, null, 2)
      }`,
    );
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
  const configJson = JSON.parse(await Deno.readTextFile(configFile));
  const configValidation = validate(
    FdbDatabaseConfigSchema,
    configJson,
  );

  if (!configValidation.isSuccess) {
    logger.error(configValidation.errors);
    throw new Error("Invalid cluster config");
  }

  return configValidation.value;
}

function RelaxedObject<T extends TProperties>(
  properties: T,
): TObject<T> {
  return Type.Object<T>(properties, { additionalProperties: true });
}

export const ServiceSpecSchema = RelaxedObject({
  clusterIP: Type.String({ format: "ipv4" }),
  ports: Type.Array(
    RelaxedObject({
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
  stdin?: string | Deno.Reader;
  timeoutSeconds?: number;
}) {
  return await inheritExec({
    run: {
      cmd: commandWithTimeout([
        "kubectl",
        ...args,
      ], timeoutSeconds),
    },
    stdin,
  });
}

export async function kubectlCapture({
  args,
  stdin,
  timeoutSeconds = 5,
}: {
  args: string[];
  stdin?: string | Deno.Reader;
  timeoutSeconds?: number;
}) {
  return await captureExec({
    run: {
      cmd: commandWithTimeout([
        "kubectl",
        ...args,
      ], timeoutSeconds),
    },
    stdin,
  });
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

  const validation = validate(schema, JSON.parse(output));

  if (!validation.isSuccess) {
    logger.error(output);
    throw new Error(
      `'kubectl ${
        fullArgs.join(" ")
      }' output failed schema validation. Errors: ${
        JSON.stringify(validation.errors, null, 2)
      }`,
    );
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
    stdin: JSON.stringify(configMap),
  });
}
