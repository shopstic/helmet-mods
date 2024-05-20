import { Type } from "../../../deps/typebox.ts";
import type { Static, TObject } from "../../../deps/typebox.ts";

export const VersionBumpTargetsSchema = Type.Array(Type.Object({
  versionFilePath: Type.String(),
  name: Type.String(),
  image: Type.String(),
  platform: Type.Union([
    Type.Literal("all"),
    Type.Literal("linux/amd64"),
    Type.Literal("linux/arm64"),
  ]),
}));

export type VersionBumpTargets = Static<typeof VersionBumpTargetsSchema>;

export const VersionBumpParamsSchema = {
  gitRepoUri: Type.String({ minLength: 1 }),
  gitBranch: Type.String({ minLength: 1 }),
  checkIntervalSeconds: Type.Number({ minimum: 0 }),
  groupingDelaySeconds: Type.Number({ minimum: 0 }),
  targetsConfigFile: Type.String({ minLength: 1 }),
};

export type VersionBumpParams = Static<TObject<typeof VersionBumpParamsSchema>>;
