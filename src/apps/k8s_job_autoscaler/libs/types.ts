import { K8s, K8sApiPaths, K8sApiPathsWithCrd } from "../../../deps/k8s_fetch.ts";
import { Type } from "../../../deps/typebox.ts";

export const K8sJobAutoscalerSchema = Type.Object({
  minReconcileIntervalMs: Type.Number({ minimum: 1 }),
  namespace: Type.Optional(Type.String({ minLength: 1 })),
  apiServerBaseUrl: Type.String({ minLength: 1, format: "uri" }),
});

export type AutoscaledJobAutoscaling = {
  query: string;
  intervalSeconds: number;
  metricServerUrl: string;
};

export type AutoscaledJob = {
  apiVersion: "shopstic.com/v1";
  kind: "AutoscaledJob";
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    resourceVersion?: string;
  };
  spec: {
    autoscaling: AutoscaledJobAutoscaling;
    persistentVolumes?: Array<{
      volumeName: string;
      claimPrefix: string;
    }>;
    jobTemplate: K8s["io.k8s.api.batch.v1.Job"];
  };
};

export type Paths = K8sApiPathsWithCrd<K8sApiPaths, AutoscaledJob>;
