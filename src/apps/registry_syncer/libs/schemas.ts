import { Type } from "../../../deps/typebox.ts";
import type { Static, TObject } from "../../../deps/typebox.ts";
import { NonEmptyString } from "../../../libs/utils.ts";

export const RegistrySyncJobSchema = Type.Object({
  name: NonEmptyString,
  fromImage: NonEmptyString,
  toImage: NonEmptyString,
  tag: NonEmptyString,
  platform: Type.Union([
    Type.Literal("all"),
    Type.Literal("linux/amd64"),
    Type.Literal("linux/arm64"),
  ]),
});

export type RegistrySyncJob = Static<typeof RegistrySyncJobSchema>;

export const RegistrySyncJobsSchema = Type.Array(RegistrySyncJobSchema);

export type RegistrySyncJobs = Static<typeof RegistrySyncJobsSchema>;

export const RegistrySyncParamsSchema = {
  digestCheckIntervalSeconds: Type.Number({ minimum: 1 }),
  configCheckIntervalSeconds: Type.Number({ minimum: 1 }),
  configFile: NonEmptyString,
};

export type RegistrySyncParams = Static<TObject<typeof RegistrySyncParamsSchema>>;
