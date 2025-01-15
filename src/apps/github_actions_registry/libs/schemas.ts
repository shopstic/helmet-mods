import { Int, Num, Obj, Opt, Str } from "../../../deps/schema.ts";

export const GithubActionsRegistryParamsSchema = {
  org: Str({ minLength: 1 }),
  appId: Int(),
  installationId: Num(),
  privateKeyPath: Str({ minLength: 1 }),
  clientRefreshIntervalSeconds: Num({ minimum: 1 }),
  perRepoMinRefreshIntervalMs: Num({ minimum: 1 }),
  allReposRefreshIntervalSeconds: Num({ minimum: 1 }),
  activeReposLastPushedWithinHours: Opt(Num({ minimum: 1 }), 1),
  webhookSigningKeyPath: Str({ minLength: 1 }),
  webhookServerPort: Num({ minimum: 0, maximum: 65535 }),
  registryServerPort: Num({ minimum: 0, maximum: 65535 }),
  busyJobAnnotation: Str({ minLength: 1 }),
  namespace: Opt(Str({ minLength: 1 })),
};

const GithubActionsRegistryParamsSchemaObj = Obj(GithubActionsRegistryParamsSchema);
export type GithubActionsRegistryParams = typeof GithubActionsRegistryParamsSchemaObj.infer;
