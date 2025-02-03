import { Int, NonEmpStr, Num, Obj, Opt, PortNum } from "$deps/schema.ts";

export const GithubActionsRegistryParamsSchema = {
  org: NonEmpStr(),
  appId: Int(),
  installationId: Num(),
  privateKeyPath: NonEmpStr(),
  clientRefreshIntervalSeconds: Opt(Num({ minimum: 1 }), 120),
  perRepoMinRefreshIntervalMs: Opt(Num({ minimum: 1 }), 2000),
  allReposRefreshIntervalSeconds: Opt(Num({ minimum: 1 })),
  activeReposLastPushedWithinHours: Opt(Num({ minimum: 1 }), 1),
  webhookSigningKeyPath: Opt(NonEmpStr()),
  webhookServerPort: Opt(PortNum()),
  registryServerPort: PortNum(),
  busyJobAnnotation: Opt(NonEmpStr(), "helmet.run/github-actions-job-in-progress=true"),
  namespace: Opt(NonEmpStr()),
};

const GithubActionsRegistryParamsSchemaObj = Obj(GithubActionsRegistryParamsSchema);
export type GithubActionsRegistryInputParams = typeof GithubActionsRegistryParamsSchemaObj.inferInput;
export type GithubActionsRegistryParams = typeof GithubActionsRegistryParamsSchemaObj.infer;
