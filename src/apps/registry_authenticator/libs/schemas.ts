import { Arr, Lit, NonEmpStr, Num, Obj, Opt, Uni } from "$deps/schema.ts";

export const RegistryAuthSchema = Uni([
  Obj({
    type: Lit("static"),
    registry: NonEmpStr(),
    username: NonEmpStr(),
    password: NonEmpStr(),
  }),
  Obj({
    type: Lit("ecr"),
    registry: NonEmpStr(),
    region: NonEmpStr(),
    refreshIntervalSeconds: Num({ minimum: 1 }),
  }),
]);

export type RegistryAuth = typeof RegistryAuthSchema.infer;
export const RegistryAuthConfigSchema = Arr(RegistryAuthSchema);
export type RegistryAuthConfig = typeof RegistryAuthConfigSchema.infer;

export const RegistryAuthParamsSchema = {
  configFile: NonEmpStr(),
  outputSecretNamespace: Opt(NonEmpStr()),
  outputSecretName: NonEmpStr(),
  configLoadIntervalSeconds: Num({ minimum: 1 }),
};

const RegistryAuthParamsSchemaObj = Obj(RegistryAuthParamsSchema);
export type RegistryAuthParams = typeof RegistryAuthParamsSchemaObj.infer;
