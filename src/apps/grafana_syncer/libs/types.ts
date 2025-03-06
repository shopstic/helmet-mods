import type { K8sApiPaths } from "@wok/k8s-api";
import type { K8sApiPathsWithCrd } from "@wok/k8s-utils/crd";

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
