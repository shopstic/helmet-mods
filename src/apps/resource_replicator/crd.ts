import { Arr, Bool, Lit, Obj, Opt, Str, Uni, Unk } from "@wok/schema/schema";
import { type K8s, K8sCrdKind } from "@wok/k8s-utils/resource";

export const PatchOperationSchema = Uni([
  Obj({
    path: Str(),
    op: Lit("add"),
    value: Unk(),
  }),
  Obj({
    path: Str(),
    op: Lit("remove"),
  }),
  Obj({
    path: Str(),
    op: Lit("replace"),
    value: Unk(),
  }),
  Obj({
    path: Str(),
    op: Lit("move"),
    from: Str(),
  }),
  Obj({
    path: Str(),
    op: Lit("copy"),
    from: Str(),
  }),
  Obj({
    path: Str(),
    op: Lit("test"),
    value: Unk(),
  }),
  Obj({
    path: Str(),
    op: Lit("render"),
    template: Str(),
    replace: Bool(),
    open: Opt(Str()),
    close: Opt(Str()),
  }),
]);

export type PatchOperation = typeof PatchOperationSchema.infer;

export const ReplicatedResourceSpecSchema = Obj({
  kind: Str(),
  fromNamespace: Str(),
  fromName: Str(),
  toName: Str(),
  patches: Opt(Arr(PatchOperationSchema)),
});

export const replicatedResourceCrd = {
  apiVersion: "apiextensions.k8s.io/v1",
  kind: K8sCrdKind,
  metadata: {
    name: "replicatedresources.shopstic.com",
  },
  spec: {
    group: "shopstic.com",
    versions: [
      {
        name: "v1",
        served: true,
        storage: true,
        schema: {
          openAPIV3Schema: Obj({
            spec: ReplicatedResourceSpecSchema,
          }).toJsonSchema(),
        },
      },
    ],
    scope: "Cluster",
    names: {
      plural: "replicatedresources",
      singular: "replicatedresource",
      kind: "ReplicatedResource",
      shortNames: ["rr"],
    },
  },
} as const satisfies K8s["io.k8s.apiextensions-apiserver.pkg.apis.apiextensions.v1.CustomResourceDefinition"];
