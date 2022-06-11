import { Type } from "../../../deps/typebox.ts";
import type { Static } from "../../../deps/typebox.ts";

export function NonEmptyString() {
  return Type.String({ minLength: 1 });
}

export const FdbDatabaseConfigSchema = Type.PartialObject({
  storageEngine: Type.Union([
    Type.Literal("memory-1"),
    Type.Literal("memory-2"),
    Type.Literal("memory-radixtree-beta"),
    Type.Literal("ssd-1"),
    Type.Literal("ssd-2"),
    Type.Literal("ssd-redwood-1-experimental"),
    Type.Literal("ssd-rocksdb-v1"),
  ]),
  redundancyMode: Type.Union([
    Type.Literal("single"),
    Type.Literal("double"),
    Type.Literal("triple"),
    Type.Literal("three_datacenter"),
    Type.Literal("three_datacenter_fallback"),
    Type.Literal("three_data_hall"),
    Type.Literal("three_data_hall_fallback"),
  ]),
  logCount: Type.Number({ minimum: 1 }),
  proxyCount: Type.Optional(Type.Number({ minimum: 1 })),
  grvProxyCount: Type.Optional(Type.Number({ minimum: 1 })),
  commitProxyCount: Type.Optional(Type.Number({ minimum: 1 })),
  resolverCount: Type.Number({ minimum: 1 }),
  coordinatorServiceNames: Type.Array(Type.String()),
  excludedServiceEndpoints: Type.Array(Type.PartialObject({
    name: Type.String(),
    port: Type.Number({ minimum: 1, maximum: 65535 }),
  })),
});

export type FdbDatabaseConfig = Static<typeof FdbDatabaseConfigSchema>;

export const FdbStatusProcessSchema = Type.PartialObject({
  address: Type.String(),
  excluded: Type.Optional(Type.Boolean()),
  machine_id: Type.Optional(Type.String()),
  class_type: Type.Union([
    Type.Literal("unset"),
    Type.Literal("coordinator"),
    Type.Literal("storage"),
    Type.Literal("transaction"),
    Type.Literal("stateless"),
    Type.Literal("proxy"),
    Type.Literal("log"),
    Type.Literal("master"),
  ]),
});

export const FdbStatusSchema = Type.PartialObject({
  cluster: Type.PartialObject({
    configuration: Type.Optional(Type.PartialObject({
      resolvers: Type.Number(),
      proxies: Type.Optional(Type.Number()),
      grv_proxies: Type.Optional(Type.Number()),
      commit_proxies: Type.Optional(Type.Number()),
      logs: Type.Number(),
      redundancy_mode: FdbDatabaseConfigSchema.properties.redundancyMode,
      storage_engine: FdbDatabaseConfigSchema.properties.storageEngine,
    })),
    recovery_state: Type.Optional(Type.PartialObject({
      name: Type.String(),
      description: Type.String(),
    })),
    processes: Type.Optional(
      Type.Record(Type.String(), FdbStatusProcessSchema),
    ),
  }),
  client: Type.PartialObject({
    database_status: Type.PartialObject({
      available: Type.Boolean(),
    }),
    coordinators: Type.PartialObject({
      quorum_reachable: Type.Boolean(),
      coordinators: Type.Array(Type.PartialObject({
        address: Type.String(),
        reachable: Type.Boolean(),
      })),
    }),
  }),
});

export type FdbStatus = Static<typeof FdbStatusSchema>;
export type FdbStatusProcess = Static<typeof FdbStatusProcessSchema>;
