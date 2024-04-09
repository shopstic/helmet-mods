import type { K8sApiPaths, K8sApiPathsWithCrd } from "../../../deps/k8s_openapi.ts";
import type { Static} from "../../../deps/typebox.ts";
import { Type } from "../../../deps/typebox.ts";

export type GrafanaDashboard = {
  apiVersion: "shopstic.com/v1";
  kind: "GrafanaDashboard";
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    resourceVersion?: string;
    deletionTimestamp?: string;
    finalizers?: string[];
  };
  spec: {
    dashboard: Record<string, unknown>;
    folderId?: number;
    folderUid?: string;
  };
};

export type Paths = K8sApiPathsWithCrd<K8sApiPaths, GrafanaDashboard>;

export const GrafanaSyncerParamsSchema = Type.Object({
  namespace: Type.Optional(Type.String({ minLength: 1 })),
  k8sApiServerBaseUrl: Type.String({ minLength: 1, format: "uri" }),
  grafanaApiServerBaseUrl: Type.String({ minLength: 1, format: "uri" }),
  grafanaBearerToken: Type.String({ minLength: 1 }),
  labelSelector: Type.Optional(Type.String({ minLength: 1 })),
  fieldSelector: Type.Optional(Type.String({ minLength: 1 })),
});

export type GrafanaSyncerParams = Static<typeof GrafanaSyncerParamsSchema>;
