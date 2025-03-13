import type { K8sApiPaths } from "@wok/k8s-api";
import type { K8sApiPathsWithGlobalCrd } from "@wok/k8s-utils/crd";
import type { TakoWarmEc2Node, TakoWarmEc2NodeSpec } from "../crd.ts";
import type { OpenapiClient } from "@wok/openapi-client";

export type TakoK8sPaths = K8sApiPathsWithGlobalCrd<K8sApiPaths, TakoWarmEc2Node>;
export type TakoK8sClient = OpenapiClient<TakoK8sPaths>;

export const ec2RootVolumeDeviceName = "/dev/xvda";
// export const takoManagedLabel = "wok.run/managed-by";
// export const takoManagedValue = "tako";

export const takoExecutionIdLabel = "wok.run/tako-execution-id";
export const takoInstalledLabel = "wok.run/tako-installed";
export const takoInstalledValue = "yes";
// export const takoManagedLabelSelector = `${takoManagedLabel}=${takoManagedValue}`;

export type TakoWarmEc2ServerSpec = TakoWarmEc2NodeSpec["server"];
export type WarmEc2ServerSpecKey = keyof TakoWarmEc2ServerSpec;
export type TakoWarmEc2ServerUpdateSpec = Partial<
  Pick<TakoWarmEc2ServerSpec, "instanceType" | "rootVolumeSizeGibs">
>;

export const ec2NonTerminatedStates = ["pending", "running", "shutting-down", "stopping", "stopped"] as const;

export interface TakoWarmEc2Instance {
  id: string;
  name: string;
  state: typeof ec2NonTerminatedStates[number];
  meta?: {
    spec: TakoWarmEc2ServerSpec;
    executionId: string;
    installed: boolean;
  };
}
