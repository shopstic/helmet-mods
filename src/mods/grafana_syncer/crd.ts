export default {
  apiVersion: "apiextensions.k8s.io/v1",
  kind: "CustomResourceDefinition",
  metadata: {
    name: "grafanadashboards.shopstic.com",
  },
  spec: {
    group: "shopstic.com",
    versions: [
      {
        name: "v1",
        served: true,
        storage: true,
        schema: {
          openAPIV3Schema: {
            type: "object",
            properties: {
              spec: {
                type: "object",
                required: ["dashboard"],
                properties: {
                  dashboard: {
                    type: "object",
                    "x-kubernetes-preserve-unknown-fields": true,
                  },
                  folderId: {
                    type: "number",
                  },
                  folderUid: {
                    type: "string",
                  },
                },
              },
            },
            required: ["spec"],
          },
        },
      },
    ],
    scope: "Namespaced",
    names: {
      plural: "grafanadashboards",
      singular: "grafanadashboard",
      kind: "GrafanaDashboard",
      shortNames: ["gd"],
    },
  },
};
