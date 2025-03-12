import { Arr, Enum, NonEmpStr, Obj, Opt, PosInt } from "@wok/schema/schema";
import type { K8s } from "@wok/k8s-api";
import type { SetRequired } from "type-fest";
import { K8sCrdKind } from "@wok/k8s-utils";

const TakoWarmEc2NodeCrdSpecSchema = Obj({
  server: Obj({
    ami: NonEmpStr(),
    subnetId: NonEmpStr(),
    securityGroupIds: Arr(NonEmpStr()),
    instanceType: NonEmpStr(),
    // rootVolumeDeviceName: Opt(NonEmpStr(), "/dev/xvda"),
    rootVolumeSizeGibs: PosInt(),
  }),
  node: Obj({
    labels: Opt(Obj({}, { additionalProperties: true })),
    taints: Opt(Arr(Obj({
      effect: Enum(["NoSchedule", "PreferNoSchedule", "NoExecute"]),
      key: NonEmpStr(),
      value: Opt(NonEmpStr()),
    }))),
    stopDelaySeconds: Opt(PosInt(), 10),
  }),
});

export const takoWarmEc2NodeCrdFinalizer = "wok.run/tako-finalizer" as const;

type TakoWarmEc2NodeCrdSpecOutput = typeof TakoWarmEc2NodeCrdSpecSchema.infer;
export type TakoWarmEc2NodeSpec = TakoWarmEc2NodeCrdSpecOutput & {
  name: string;
};

type CrdMetadata = SetRequired<K8s["io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta"], "name">;

export interface TakoWarmEc2Node {
  apiVersion: "wok.run/v1";
  kind: "WarmEc2Node";
  metadata: CrdMetadata;
  spec: TakoWarmEc2NodeCrdSpecOutput;
}

export interface TakoWarmEc2NodeOptions {
  metadata: CrdMetadata;
  spec: typeof TakoWarmEc2NodeCrdSpecSchema.inferInput;
}

export function createK8sWarmEc2Node({ metadata, ...rest }: TakoWarmEc2NodeOptions) {
  return {
    apiVersion: "wok.run/v1",
    kind: "WarmEc2Node",
    metadata: {
      ...metadata,
      finalizers: [
        ...metadata.finalizers ?? [],
        takoWarmEc2NodeCrdFinalizer,
      ],
    },
    ...rest,
  };
}

export const takoWarmEc2NodeCrd = {
  apiVersion: "apiextensions.k8s.io/v1",
  kind: K8sCrdKind,
  metadata: {
    name: "warmec2nodes.wok.run",
  },
  spec: {
    group: "wok.run",
    versions: [
      {
        name: "v1",
        served: true,
        storage: true,
        schema: {
          openAPIV3Schema: Obj({
            spec: TakoWarmEc2NodeCrdSpecSchema,
          }).toJsonSchema(),
        },
      },
    ],
    scope: "Cluster",
    names: {
      plural: "warmec2nodes",
      singular: "warmec2node",
      kind: "WarmEc2Node",
      shortNames: ["wec2"],
    },
  },
} as const satisfies K8s["io.k8s.apiextensions-apiserver.pkg.apis.apiextensions.v1.CustomResourceDefinition"];
