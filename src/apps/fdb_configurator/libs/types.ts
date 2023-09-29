import { FlexObject, Type } from "../../../deps/typebox.ts";
import type { Static } from "../../../deps/typebox.ts";

export function NonEmptyString() {
  return Type.String({ minLength: 1 });
}

export const FdbRedundancyModeSchema = Type.Union([
  Type.Literal("single"),
  Type.Literal("double"),
  Type.Literal("triple"),
  Type.Literal("three_datacenter"),
  Type.Literal("three_datacenter_fallback"),
  Type.Literal("three_data_hall"),
  Type.Literal("three_data_hall_fallback"),
]);

export const FdbStorageEngineSchema = Type.Union([
  Type.Literal("memory-1"),
  Type.Literal("memory-2"),
  Type.Literal("memory-radixtree-beta"),
  Type.Literal("ssd-1"),
  Type.Literal("ssd-2"),
  Type.Literal("ssd-redwood-1-experimental"),
  Type.Literal("ssd-rocksdb-v1"),
]);

export const FdbDatabaseConfigSchema = FlexObject({
  storageEngine: FdbStorageEngineSchema,
  redundancyMode: FdbRedundancyModeSchema,
  logCount: Type.Number({ minimum: 1 }),
  grvProxyCount: Type.Number({ minimum: 1 }),
  commitProxyCount: Type.Number({ minimum: 1 }),
  resolverCount: Type.Number({ minimum: 1 }),
  coordinatorServiceNames: Type.Array(Type.String()),
  excludedServiceEndpoints: Type.Array(FlexObject({
    name: Type.String(),
    port: Type.Number({ minimum: 1, maximum: 65535 }),
  })),
  perpetualStorageWiggle: Type.Number(),
  perpetualStorageWiggleLocality: Type.String(),
  storageMigrationType: Type.Union([
    Type.Literal("disabled"),
    Type.Literal("gradual"),
    Type.Literal("aggressive"),
  ]),
  tenantMode: Type.Optional(Type.Union([
    Type.Literal("disabled"),
    Type.Literal("optional_experimental"),
    Type.Literal("required_experimental"),
  ])),
});

export type FdbDatabaseConfig = Static<typeof FdbDatabaseConfigSchema>;

export const FdbStatusProcessSchema = FlexObject({
  address: Type.String(),
  excluded: Type.Optional(Type.Boolean()),
  machine_id: Type.Optional(Type.String()),
  class_type: Type.Union([
    Type.Literal("unset"),
    Type.Literal("coordinator"),
    Type.Literal("storage"),
    Type.Literal("transaction"),
    Type.Literal("stateless"),
    Type.Literal("commit_proxy"),
    Type.Literal("grv_proxy"),
    Type.Literal("log"),
    Type.Literal("master"),
  ]),
});

export const FdbStatusSchema = FlexObject({
  cluster: FlexObject({
    configuration: Type.Optional(FlexObject({
      resolvers: Type.Number(),
      proxies: Type.Optional(Type.Number()),
      grv_proxies: Type.Optional(Type.Number()),
      commit_proxies: Type.Optional(Type.Number()),
      logs: Type.Number(),
      perpetual_storage_wiggle: Type.Number(),
      perpetual_storage_wiggle_locality: Type.String(),
      storage_migration_type: Type.String(),
      tenant_mode: Type.String(),
      redundancy_mode: FdbRedundancyModeSchema,
      storage_engine: FdbStorageEngineSchema,
    })),
    recovery_state: Type.Optional(FlexObject({
      name: Type.String(),
      description: Type.String(),
    })),
    processes: Type.Optional(
      Type.Record(Type.String(), FdbStatusProcessSchema),
    ),
  }),
  client: FlexObject({
    database_status: FlexObject({
      available: Type.Boolean(),
    }),
    coordinators: FlexObject({
      quorum_reachable: Type.Boolean(),
      coordinators: Type.Array(FlexObject({
        address: Type.String(),
        reachable: Type.Boolean(),
      })),
    }),
  }),
});

export type FdbStatus = Static<typeof FdbStatusSchema>;
export type FdbStatusProcess = Static<typeof FdbStatusProcessSchema>;
