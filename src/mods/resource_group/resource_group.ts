import { createK8sNamespace, K8sResource } from "../../deps/helmet.ts";
import { defineChartInstance } from "../../deps/helmet.ts";
import { K8sCrd } from "../../deps/helmet.ts";
import releaseVersion from "../../version.ts";

export interface ResourceGroupParams {
  name: string;
  namespace: string;
  resources: K8sResource[];
  createNamespace?: boolean;
  labels?: Record<string, string>;
  version?: string;
  crds?: K8sCrd[];
}

export default defineChartInstance(
  (
    {
      name,
      namespace,
      resources,
      crds = [],
      createNamespace = true,
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
        ...((createNamespace)
          ? [createK8sNamespace({
            metadata: {
              name: namespace,
            },
          })]
          : []),
        ...resources,
      ],
      crds: crds || [],
    });
  },
);
