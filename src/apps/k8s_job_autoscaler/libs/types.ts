import { K8s, K8sApiPaths, K8sApiPathsWithCrd } from "../../../deps/k8s_openapi.ts";
import { Static, Type } from "../../../deps/typebox.ts";

export const K8sJobAutoscalerParamsSchema = Type.Object({
  minReconcileIntervalMs: Type.Number({ minimum: 1 }),
  namespace: Type.Optional(Type.String({ minLength: 1 })),
  apiServerBaseUrl: Type.String({ minLength: 1, format: "url" }),
});

export type K8sJobAutoscalerParams = Static<typeof K8sJobAutoscalerParamsSchema>;

export type AutoscaledJobAutoscaling = {
  query: string;
  pendingMetric?: unknown;
  inProgressMetric?: unknown;
  intervalSeconds: number;
  metricServerUrl: string;
  maxReplicas: number;
  busyAnnotation?: {
    name: string;
    value: string;
  };
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
    jobTemplate: K8s["batch.v1.Job"];
  };
};

export type Paths = K8sApiPathsWithCrd<K8sApiPaths, AutoscaledJob>;
