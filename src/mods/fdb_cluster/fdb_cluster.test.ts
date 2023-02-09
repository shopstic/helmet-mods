import { FdbStatefulConfig } from "./lib/fdb_stateful.ts";
import { assertEquals, assertNotEquals } from "../../deps/std_testing.ts";

import { createFdbClusterResources } from "./fdb_cluster.ts";
import { K8s } from "../../deps/helmet.ts";

Deno.test("fdb_cluster should work", () => {
  const baseName = "test";
  const namespace = "test";
  const nodeSelector = {
    foo: "bar",
  };

  const tolerations = [{
    key: "foo",
    operator: "Equal",
    value: "bar",
    effect: "NoExecute",
  }];

  const fdbStatefulConfigs: Record<string, FdbStatefulConfig> = {
    "coordinator": {
      processClass: "coordinator",
      servers: [{ port: 4500 }],
      nodeSelector,
      tolerations,
      volumeSize: "1Gi",
      storageClassName: "local-path",
    },
    "log": {
      processClass: "log",
      servers: [{ port: 4500 }],
      nodeSelector,
      tolerations,
      volumeSize: "1Gi",
      storageClassName: "local-path",
    },
    "storage": {
      processClass: "storage",
      servers: [{ port: 4500 }],
      nodeSelector,
      tolerations,
      volumeSize: "1Gi",
      storageClassName: "local-path",
      resourceRequirements: {
        requests: {
          cpu: "2",
        },
      },
    },
  };

  const cluster = createFdbClusterResources({
    baseName,
    namespace,
    storageEngine: "ssd-2",
    redundancyMode: "single",
    currentGeneration: {
      id: "",
      stateless: {
        mode: "prod",
        grvProxyCount: 1,
        commitProxyCount: 1,
        resolverCount: 1,
        standbyCount: 0,
        nodeSelector,
        tolerations,
      },
      stateful: fdbStatefulConfigs,
    },
    helpersNodeSelector: nodeSelector,
    helpersTolerations: tolerations,
    labels: {
      foo: "bar",
    },
    locality: "data_hall",
  });

  assertEquals(cluster.currentStatefulSets.length, 3);
  assertEquals(cluster.backupDeployment, undefined);
  assertNotEquals(cluster.currentGrvProxyDeployment, undefined);
  assertNotEquals(cluster.currentCommitProxyDeployment, undefined);
  assertEquals(cluster.currentStatelessDeployment.spec?.replicas, 5);
  assertEquals(cluster.currentStatelessDeployment.metadata.labels?.foo, "bar");

  assertEquals(
    cluster.currentStatefulSets.find((s) => s.metadata.name.includes("storage")!)?.spec
      ?.template.spec?.containers.filter((c) => c.resources?.requests !== undefined).length,
    1,
  );

  const allWorkloadPodTemplates: Array<NonNullable<K8s["core.v1.PodTemplate"]["template"]>> = [
    cluster.currentStatelessDeployment.spec!.template,
    cluster.currentGrvProxyDeployment!.spec!.template,
    cluster.currentCommitProxyDeployment!.spec!.template,
    ...(cluster.currentStatefulSets.map((s) => s.spec!.template)),
  ];

  const allPodTemplates: Array<NonNullable<K8s["core.v1.PodTemplate"]["template"]>> = [
    ...allWorkloadPodTemplates,
    cluster.createConnectionString.job.spec!.template,
    cluster.configure.job.spec!.template,
    cluster.exporter.deployment.spec!.template,
    cluster.syncConnectionString.deployment.spec!.template,
  ];

  allPodTemplates.forEach((template) => {
    assertEquals(template.spec!.nodeSelector, nodeSelector);
    assertEquals(template.spec!.tolerations, tolerations);
  });

  const allWorkloadContainers: K8s["core.v1.Container"][] = allWorkloadPodTemplates.flatMap((t) => t.spec!.containers);

  allWorkloadContainers.filter((c) => c.name !== "readiness").forEach((container) => {
    assertNotEquals(
      container.env!.find(({ name }) => name === "FDB_DATA_HALL"),
      undefined,
    );
  });
});
