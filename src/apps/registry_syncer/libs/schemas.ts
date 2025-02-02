import { Arr, Lit, NonEmpStr, Num, Obj, Uni } from "$deps/schema.ts";

export const RegistrySyncJobSchema = Obj({
  name: NonEmpStr(),
  fromImage: NonEmpStr(),
  toImage: NonEmpStr(),
  tag: NonEmpStr(),
  platform: Uni([
    Lit("all"),
    Lit("linux/amd64"),
    Lit("linux/arm64"),
  ]),
});

export type RegistrySyncJob = typeof RegistrySyncJobSchema.infer;

export const RegistrySyncJobsSchema = Arr(RegistrySyncJobSchema);

export type RegistrySyncJobs = typeof RegistrySyncJobsSchema.infer;

export const RegistrySyncParamsSchema = {
  digestCheckIntervalSeconds: Num({ minimum: 1 }),
  configCheckIntervalSeconds: Num({ minimum: 1 }),
  configFile: NonEmpStr(),
};

const RegistrySyncParamsSchemaObj = Obj(RegistrySyncParamsSchema);

export type RegistrySyncParams = typeof RegistrySyncParamsSchemaObj.infer;
