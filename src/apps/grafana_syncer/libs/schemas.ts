import { Obj, Opt, Str } from "../../../deps/schema.ts";

export const GrafanaSyncerParamsSchema = {
  namespace: Opt(Str({ minLength: 1 })),
  k8sApiServerBaseUrl: Str({ minLength: 1, format: "uri" }),
  grafanaApiServerBaseUrl: Str({ minLength: 1, format: "uri" }),
  grafanaBearerToken: Str({ minLength: 1 }),
  labelSelector: Opt(Str({ minLength: 1 })),
  fieldSelector: Opt(Str({ minLength: 1 })),
};

const GrafanaSyncerParamsSchemaObj = Obj(GrafanaSyncerParamsSchema);

export type GrafanaSyncerParams = typeof GrafanaSyncerParamsSchemaObj.infer;
