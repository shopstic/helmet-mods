import type { K8sApiPaths, K8sApiPathsWithCrd } from "../../../deps/k8s_openapi.ts";
import type { AutoscaledJob } from "./schemas.ts";

export type Paths = K8sApiPathsWithCrd<K8sApiPaths, AutoscaledJob>;
