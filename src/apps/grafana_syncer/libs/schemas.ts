import type { Static, TObject } from "../../../deps/typebox.ts";
import { Type } from "../../../deps/typebox.ts";

export const GrafanaSyncerParamsSchema = {
  namespace: Type.Optional(Type.String({ minLength: 1 })),
  k8sApiServerBaseUrl: Type.String({ minLength: 1, format: "uri" }),
  grafanaApiServerBaseUrl: Type.String({ minLength: 1, format: "uri" }),
  grafanaBearerToken: Type.String({ minLength: 1 }),
  labelSelector: Type.Optional(Type.String({ minLength: 1 })),
  fieldSelector: Type.Optional(Type.String({ minLength: 1 })),
};

export type GrafanaSyncerParams = Static<TObject<typeof GrafanaSyncerParamsSchema>>;
