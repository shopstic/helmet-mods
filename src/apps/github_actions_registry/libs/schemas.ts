import type { Static, TObject } from "../../../deps/typebox.ts";
import { Type } from "../../../deps/typebox.ts";

export const GithubActionsRegistryParamsSchema = {
  org: Type.String({ minLength: 1 }),
  appId: Type.Integer(),
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
};

export type GithubActionsRegistryParams = Static<TObject<typeof GithubActionsRegistryParamsSchema>>;
