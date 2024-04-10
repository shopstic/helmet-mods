import type { K8sApiPaths, K8sApiPathsWithCrd } from "../../../deps/k8s_openapi.ts";

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
