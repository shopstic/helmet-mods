function* traverse(
  o: Record<string, unknown>,
  path: string[] = [],
): Generator<[string, unknown, string[], Record<string, unknown>]> {
  for (const i of Object.keys(o)) {
    const itemPath = path.concat([i]);
    yield [i, o[i], itemPath, o];

    if (o[i] !== null && typeof (o[i]) === "object") {
      yield* traverse(o[i] as Record<string, unknown>, itemPath);
    }
  }
}

const schemaUrl = "https://raw.githubusercontent.com/kubernetes/kubernetes/v1.22.12/api/openapi-spec/swagger.json";
const schema = await (await fetch(schemaUrl)).json();
const strippedKeys = [
  "x-kubernetes-patch-merge-key",
  "x-kubernetes-patch-strategy",
  "x-kubernetes-group-version-kind",
  "x-kubernetes-unions",
  "x-kubernetes-list-map-keys",
  "x-kubernetes-list-type",
  "status",
  "managedFields",
];

function deref(obj: Record<string, unknown>) {
  for (
    const [key, value, _, parent] of traverse(obj)
  ) {
    if (strippedKeys.indexOf(key) !== -1) {
      delete parent[key];
    } else if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>;

      if (typeof record.description === "string" && record.description.includes("Populated by the system")) {
        delete parent[key];
      } else {
        if (typeof record["$ref"] === "string") {
          const refKey = record["$ref"].replace(/^#\/definitions\//, "");
          const ref = schema.definitions[refKey];
          delete record["$ref"];
          Object.assign(record, deref(ref));
        }

        strippedKeys.forEach((k) => {
          if (typeof record[k] !== "undefined") {
            delete record[k];
          }
        });
      }
    }
  }

  return obj;
}

const k8sJobSchema = deref(schema.definitions["io.k8s.api.batch.v1.Job"]);

const crd = {
  apiVersion: "apiextensions.k8s.io/v1",
  kind: "CustomResourceDefinition",
  metadata: {
    name: "autoscaledjobs.shopstic.com",
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
                properties: {
                  autoscaling: {
                    type: "object",
                    required: ["query", "intervalSeconds", "metricServerUrl"],
                    properties: {
                      query: {
                        type: "string",
                      },
                      intervalSeconds: {
                        type: "number",
                      },
                      metricServerUrl: {
                        type: "string",
                      },
                    },
                  },
                  persistentVolumes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        volumeName: {
                          type: "string",
                        },
                        claimPrefix: {
                          type: "string",
                        },
                      },
                      required: ["volumeName", "claimPrefix"],
                    },
                  },
                  jobTemplate: k8sJobSchema,
                },
                required: ["autoscaling", "jobTemplate"],
              },
            },
            required: ["spec"],
          },
        },
      },
    ],
    scope: "Namespaced",
    names: {
      plural: "autoscaledjobs",
      singular: "autoscaledjob",
      kind: "AutoscaledJob",
      shortNames: ["aj"],
    },
  },
};

console.log(JSON.stringify(crd, null, 2));
