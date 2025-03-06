import type { K8sApiPathsWithCrd } from "@wok/k8s-utils/crd";
import type { K8sApiPaths } from "@wok/k8s-api";
import type { AutoscaledJob } from "./schemas.ts";

export type Paths = K8sApiPathsWithCrd<K8sApiPaths, AutoscaledJob>;
