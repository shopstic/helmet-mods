import { Arr, Lit, Num, Obj, Str, Uni } from "$deps/schema.ts";

export const VersionBumpTargetsSchema = Arr(Obj({
  versionFilePath: Str(),
  name: Str(),
  image: Str(),
  platform: Uni([
    Lit("all"),
    Lit("linux/amd64"),
    Lit("linux/arm64"),
  ]),
}));

export type VersionBumpTargets = typeof VersionBumpTargetsSchema.infer;

export const VersionBumpParamsSchema = {
  gitRepoUri: Str({ minLength: 1 }),
  gitBranch: Str({ minLength: 1 }),
  checkIntervalSeconds: Num({ minimum: 0 }),
  groupingDelaySeconds: Num({ minimum: 0 }),
  targetsConfigFile: Str({ minLength: 1 }),
};

const VersionBumpParamsSchemaObj = Obj(VersionBumpParamsSchema);

export type VersionBumpParams = typeof VersionBumpParamsSchemaObj.infer;
