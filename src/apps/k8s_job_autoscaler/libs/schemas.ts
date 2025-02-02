import type { K8s } from "$deps/k8s_openapi.ts";
import { Num, Obj, Opt, Str } from "$deps/schema.ts";

export const K8sJobAutoscalerParamsSchema = {
  minReconcileIntervalMs: Num({ minimum: 1 }),
  namespace: Opt(Str({ minLength: 1 })),
  apiServerBaseUrl: Str({ minLength: 1, format: "uri" }),
};

const K8sJobAutoscalerParamsSchemaObj = Obj(K8sJobAutoscalerParamsSchema);

export type K8sJobAutoscalerParams = typeof K8sJobAutoscalerParamsSchemaObj.infer;

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
