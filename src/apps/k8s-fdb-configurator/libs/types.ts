import { TObject, TProperties, Type } from "./deps/typebox.ts";
import type { Static } from "./deps/typebox.ts";

export function NonEmptyString() {
  return Type.String({ minLength: 1 });
}

export const FdbDatabaseConfigSchema = RelaxedObject({
  storageEngine: Type.Union([
    Type.Literal("ssd-2"),
    Type.Literal("ssd-redwood-experimental"),
  ]),
  redundancyMode: Type.Union([
    Type.Literal("single"),
    Type.Literal("double"),
    Type.Literal("triple"),
  ]),
  logCount: Type.Number({ minimum: 1 }),
  proxyCount: Type.Number({ minimum: 1 }),
  resolverCount: Type.Number({ minimum: 1 }),
  coordinatorServiceNames: Type.Array(Type.String()),
  excludedServiceEndpoints: Type.Array(RelaxedObject({
    name: Type.String(),
    port: Type.Number({ minimum: 1, maximum: 65535 }),
  })),
});

export type FdbDatabaseConfig = Static<typeof FdbDatabaseConfigSchema>;

function RelaxedObject<T extends TProperties>(
  properties: T,
): TObject<T> {
  return Type.Object<T>(properties, { additionalProperties: true });
}

export const FdbStatusProcessSchema = RelaxedObject({
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

export const FdbStatusSchema = RelaxedObject({
  cluster: RelaxedObject({
    configuration: Type.Optional(RelaxedObject({
      resolvers: Type.Number(),
      proxies: Type.Number(),
      logs: Type.Number(),
      redundancy_mode: FdbDatabaseConfigSchema.properties.redundancyMode,
      storage_engine: FdbDatabaseConfigSchema.properties.storageEngine,
    })),
    recovery_state: Type.Optional(RelaxedObject({
      name: Type.String(),
      description: Type.String(),
    })),
    processes: Type.Optional(Type.Dict(FdbStatusProcessSchema)),
  }),
  client: RelaxedObject({
    database_status: RelaxedObject({
      available: Type.Boolean(),
    }),
    coordinators: RelaxedObject({
      quorum_reachable: Type.Boolean(),
      coordinators: Type.Array(RelaxedObject({
        address: Type.String(),
        reachable: Type.Boolean(),
      })),
    }),
  }),
});

export type FdbStatus = Static<typeof FdbStatusSchema>;
export type FdbStatusProcess = Static<typeof FdbStatusProcessSchema>;
