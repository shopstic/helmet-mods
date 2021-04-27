import { K8sResource } from "../../deps/helmet.ts";
import { defineChartInstance } from "../../deps/helmet.ts";
import { K8sCrd } from "../../deps/helmet.ts";
import releaseVersion from "../../version.ts";

export interface ResourceGroupParams {
  name: string;
  namespace: string;
  resources: K8sResource[];
  labels?: Record<string, string>;
  version?: string;
  crds?: K8sCrd[];
}

export function extractK8sResources(value: unknown): K8sResource[] {
  if (Array.isArray(value)) {
    return value.flatMap((v) => extractK8sResources(v));
  } else if (typeof value === "object" && value !== null) {
    const dict = value as Record<string, unknown>;

    if (
      typeof dict.apiVersion === "string" && dict.apiVersion.length > 0 &&
      typeof dict.kind === "string" && dict.kind.length > 0 &&
      typeof dict.metadata === "object" && dict.metadata !== null
    ) {
      const metadata = dict.metadata as Record<string, unknown>;

      if (typeof metadata.name === "string" && metadata.name.length > 0) {
        return [value as K8sResource];
      }
    }

    return Object.values(value).flatMap((v) => extractK8sResources(v));
  }

  return [];
}

export default defineChartInstance(
  (
    {
      name,
      namespace,
      resources,
      crds = [],
      labels = {},
      version = releaseVersion,
    }: ResourceGroupParams,
  ) => {
    const seedLabels = {
      "app.kubernetes.io/name": name,
      "app.kubernetes.io/instance": name,
    };

    return Promise.resolve({
      name,
      namespace,
      version,
      labels: {
        ...seedLabels,
        ...labels,
        "app.kubernetes.io/managed-by": "Helm",
      },
      resources: [
        ...resources,
      ],
      crds: crds || [],
    });
  },
);
