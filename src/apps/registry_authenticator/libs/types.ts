import type { Static} from "../../../deps/typebox.ts";
import { Type } from "../../../deps/typebox.ts";
import { NonEmptyString } from "../../../libs/utils.ts";

export const RegistryAuthSchema = Type.Union([
  Type.Object({
    type: Type.Literal("static"),
    registry: NonEmptyString,
    username: NonEmptyString,
    password: NonEmptyString,
  }),
  Type.Object({
    type: Type.Literal("ecr"),
    registry: NonEmptyString,
    region: NonEmptyString,
    refreshIntervalSeconds: Type.Number({ minimum: 1 }),
  }),
]);

export type RegistryAuth = Static<typeof RegistryAuthSchema>;
export const RegistryAuthConfigSchema = Type.Array(RegistryAuthSchema);
export type RegistryAuthConfig = Static<typeof RegistryAuthConfigSchema>;

export const RegistryAuthParamsSchema = Type.Object({
  configFile: NonEmptyString,
  outputSecretNamespace: Type.Optional(NonEmptyString),
  outputSecretName: NonEmptyString,
  configLoadIntervalSeconds: Type.Number({ minimum: 1 }),
});

export type RegistryAuthParams = Static<typeof RegistryAuthParamsSchema>;
