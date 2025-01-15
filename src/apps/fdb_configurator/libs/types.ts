import { Arr, Bool, Lit, Num, Opt, PartObj, Rec, Str, Uni } from "../../../deps/schema.ts";

export const FdbRedundancyModeSchema = Uni([
  Lit("single"),
  Lit("double"),
  Lit("triple"),
  Lit("three_datacenter"),
  Lit("three_datacenter_fallback"),
  Lit("three_data_hall"),
  Lit("three_data_hall_fallback"),
]);

export const FdbStorageEngineSchema = Uni([
  Lit("memory-1"),
  Lit("memory-2"),
  Lit("memory-radixtree-beta"),
  Lit("ssd-1"),
  Lit("ssd-2"),
  Lit("ssd-redwood-1-experimental"),
  Lit("ssd-rocksdb-v1"),
]);

export const FdbDatabaseConfigSchema = PartObj({
  storageEngine: FdbStorageEngineSchema,
  redundancyMode: FdbRedundancyModeSchema,
  logCount: Num({ minimum: 1 }),
  grvProxyCount: Num({ minimum: 1 }),
  commitProxyCount: Num({ minimum: 1 }),
  resolverCount: Num({ minimum: 1 }),
  coordinatorServiceNames: Arr(Str()),
  excludedServiceEndpoints: Arr(PartObj({
    name: Str(),
    port: Num({ minimum: 1, maximum: 65535 }),
  })),
  excludedServiceLabels: Arr(Rec(Str(), Str())),
  excludedPodLabels: Arr(Rec(Str(), Str())),
  perpetualStorageWiggle: Num(),
  perpetualStorageWiggleLocality: Str(),
  storageMigrationType: Uni([
    Lit("disabled"),
    Lit("gradual"),
    Lit("aggressive"),
  ]),
  tenantMode: Opt(Uni([
    Lit("disabled"),
    Lit("optional_experimental"),
    Lit("required_experimental"),
  ])),
});

export type FdbDatabaseConfig = typeof FdbDatabaseConfigSchema.infer;

export const FdbStatusProcessSchema = PartObj({
  address: Str(),
  excluded: Opt(Bool()),
  machine_id: Opt(Str()),
  class_type: Uni([
    Lit("unset"),
    Lit("coordinator"),
    Lit("storage"),
    Lit("transaction"),
    Lit("stateless"),
    Lit("commit_proxy"),
    Lit("grv_proxy"),
    Lit("log"),
    Lit("master"),
  ]),
});

export const FdbStatusSchema = PartObj({
  cluster: PartObj({
    configuration: Opt(PartObj({
      resolvers: Num(),
      proxies: Opt(Num()),
      grv_proxies: Opt(Num()),
      commit_proxies: Opt(Num()),
      logs: Num(),
      perpetual_storage_wiggle: Num(),
      perpetual_storage_wiggle_locality: Str(),
      storage_migration_type: Str(),
      tenant_mode: Str(),
      redundancy_mode: FdbRedundancyModeSchema,
      storage_engine: FdbStorageEngineSchema,
    })),
    recovery_state: Opt(PartObj({
      name: Str(),
      description: Str(),
    })),
    processes: Opt(
      Rec(Str(), FdbStatusProcessSchema),
    ),
  }),
  client: PartObj({
    database_status: PartObj({
      available: Bool(),
    }),
    coordinators: PartObj({
      quorum_reachable: Bool(),
      coordinators: Arr(PartObj({
        address: Str(),
        reachable: Bool(),
      })),
    }),
  }),
});

export type FdbStatus = typeof FdbStatusSchema.infer;
export type FdbStatusProcess = typeof FdbStatusProcessSchema.infer;
