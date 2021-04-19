import { FdbStatefulConfig } from "./lib/fdb_stateful.ts";
import { assert } from "../../deps/std_testing.ts";

import createFdbCluster from "./fdb_cluster.ts";

Deno.test("fdb_cluster should work", async () => {
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
    },
  };

  const cluster = await createFdbCluster({
    baseName,
    namespace,
    createNamespace: false,
    storageEngine: "ssd-2",
    redundancyMode: "single",
    stateless: {
      proxyCount: 1,
      resolverCount: 1,
      standbyCount: 0,
    },
    stateful: fdbStatefulConfigs,
    dataVolumeFactory: (claimName) => ({
      persistentVolumeClaim: {
        claimName,
      },
    }),
  });

  assert(cluster.resources.length > 0);
});
