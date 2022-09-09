import { Static, Type } from "../../../deps/typebox.ts";

export const GithubActionsRegistryParamsSchema = Type.Object({
  org: Type.String({ minLength: 1 }),
  appId: Type.String({ minLength: 1 }),
  installationId: Type.Number(),
  privateKeyPath: Type.String({ minLength: 1 }),
  clientRefreshIntervalSeconds: Type.Number({ minimum: 1 }),
  perRepoMinRefreshIntervalMs: Type.Number({ minimum: 1 }),
  allReposRefreshIntervalSeconds: Type.Number({ minimum: 1 }),
  activeReposLastPushedWithinHours: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  webhookSigningKeyPath: Type.String({ minLength: 1 }),
  webhookServerPort: Type.Number({ minimum: 0, maximum: 65535 }),
  registryServerPort: Type.Number({ minimum: 0, maximum: 65535 }),
  busyJobAnnotation: Type.String({ minLength: 1 }),
  namespace: Type.Optional(Type.String({ minLength: 1 })),
});

export type GithubActionsRegistryParams = Static<typeof GithubActionsRegistryParamsSchema>;
