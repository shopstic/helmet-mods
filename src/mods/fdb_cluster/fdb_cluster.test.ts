import { FdbStatefulConfig } from "./lib/fdb_stateful.ts";
import { assertEquals, assertNotEquals } from "../../deps/std_testing.ts";

import { createFdbClusterResources } from "./fdb_cluster.ts";

Deno.test("fdb_cluster should work", () => {
  const baseName = "test";
  const namespace = "test";

  const fdbStatefulConfigs: Record<string, FdbStatefulConfig> = {
    "coordinator": {
      processClass: "coordinator",
      servers: [{ port: 4500 }],
      nodeSelector: {},
      volumeSize: "1Gi",
      storageClassName: "local-path",
    },
    "log": {
      processClass: "log",
      servers: [{ port: 4500 }],
      nodeSelector: {},
      volumeSize: "1Gi",
      storageClassName: "local-path",
    },
    "storage": {
      processClass: "storage",
      servers: [{ port: 4500 }],
      nodeSelector: {},
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
    stateless: {
      mode: "prod",
      proxyCount: 1,
      resolverCount: 1,
      standbyCount: 0,
    },
    stateful: fdbStatefulConfigs,
    labels: {
      foo: "bar",
    },
    locality: "data_hall",
  });

  assertEquals(cluster.statefulSets.length, 3);
  assertEquals(cluster.backupDeployment, undefined);
  assertNotEquals(cluster.proxyDeployment, undefined);
  assertEquals(cluster.statelessDeployment.spec?.replicas, 5);
  assertEquals(cluster.statelessDeployment.metadata.labels?.foo, "bar");

  assertEquals(
    cluster.statefulSets.find((s) => s.metadata.name.includes("storage")!)?.spec
      ?.template.spec?.containers.filter((c) =>
        c.resources?.requests !== undefined
      ).length,
    1,
  );

  const allContainers = [
    ...(cluster.statelessDeployment.spec!.template.spec!.containers),
    ...(cluster.proxyDeployment!.spec!.template.spec!.containers),
    ...(cluster.statefulSets.flatMap((s) => s.spec!.template.spec!.containers)),
  ];

  allContainers.forEach((container) => {
    assertNotEquals(
      container.env!.find(({ name }) => name === "FDB_DATA_HALL"),
      undefined,
    );
  });
});
