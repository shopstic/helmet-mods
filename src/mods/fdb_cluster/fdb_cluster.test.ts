import { FdbStatefulConfig } from "./lib/fdb_stateful.ts";
import { assertEquals, assertNotEquals } from "../../deps/std_testing.ts";

import { createFdbClusterResources } from "./fdb_cluster.ts";
import { IoK8sApiCoreV1Container, IoK8sApiCoreV1PodTemplateSpec } from "../../deps/k8s_utils.ts";

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
    helpersNodeSelector: nodeSelector,
    helpersTolerations: tolerations,
    labels: {
      foo: "bar",
    },
    locality: "data_hall",
  });

  assertEquals(cluster.statefulSets.length, 3);
  assertEquals(cluster.backupDeployment, undefined);
  assertNotEquals(cluster.grvProxyDeployment, undefined);
  assertNotEquals(cluster.commitProxyDeployment, undefined);
  assertEquals(cluster.statelessDeployment.spec?.replicas, 5);
  assertEquals(cluster.statelessDeployment.metadata.labels?.foo, "bar");

  assertEquals(
    cluster.statefulSets.find((s) => s.metadata.name.includes("storage")!)?.spec
      ?.template.spec?.containers.filter((c) => c.resources?.requests !== undefined).length,
    1,
  );

  const allWorkloadPodTemplates: IoK8sApiCoreV1PodTemplateSpec[] = [
    cluster.statelessDeployment.spec!.template,
    cluster.grvProxyDeployment!.spec!.template,
    cluster.commitProxyDeployment!.spec!.template,
    ...(cluster.statefulSets.map((s) => s.spec!.template)),
  ];

  const allPodTemplates: IoK8sApiCoreV1PodTemplateSpec[] = [
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

  const allWorkloadContainers: IoK8sApiCoreV1Container[] = allWorkloadPodTemplates.flatMap((t) => t.spec!.containers);

  allWorkloadContainers.forEach((container) => {
    assertNotEquals(
      container.env!.find(({ name }) => name === "FDB_DATA_HALL"),
      undefined,
    );
  });
});
