import type { K8s } from "../deps/helmet.ts";

export function createPodAntiAffinity({
  labels,
  antiAffinity = [{
    key: "kubernetes.io/hostname",
    mode: "preferred",
  }, {
    key: "topology.kubernetes.io/zone",
    mode: "preferred",
  }],
}: {
  labels: Record<string, string>;
  antiAffinity?: Array<{
    key: string;
    mode: "required" | "preferred";
  }>;
}): K8s["core.v1.PodAntiAffinity"] {
  const expressions = Object.entries(labels).map(([key, value]) => ({
    key,
    operator: "In",
    values: [value],
  }));

  return {
    requiredDuringSchedulingIgnoredDuringExecution: antiAffinity.filter((
      { mode },
    ) => mode === "required").map(
      ({ key }) => ({
        labelSelector: {
          matchExpressions: expressions,
        },
        topologyKey: key,
      }),
    ),
    preferredDuringSchedulingIgnoredDuringExecution: antiAffinity.filter((
      { mode },
    ) => mode === "preferred").map(
      ({ key }, i) => ({
        weight: i + 1,
        podAffinityTerm: {
          labelSelector: {
            matchExpressions: expressions,
          },
          topologyKey: key,
        },
      }),
    ),
  };
}
