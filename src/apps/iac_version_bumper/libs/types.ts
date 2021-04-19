import { Type } from "../../../deps/typebox.ts";
import type { Static } from "../../../deps/typebox.ts";

export const VersionBumpTargetsSchema = Type.Array(Type.Object({
  versionFilePath: Type.String(),
  name: Type.String(),
  image: Type.String(),
}));

export type VersionBumpTargets = Static<typeof VersionBumpTargetsSchema>;

export const VersionBumpParamsSchema = Type.Object({
  gitRepoUri: Type.String({ minLength: 1 }),
  gitBranch: Type.String({ minLength: 1 }),
  checkIntervalSeconds: Type.Number({ minimum: 0 }),
  targetsConfigFile: Type.String({ minLength: 1 }),
});

export type VersionBumpParams = Static<typeof VersionBumpParamsSchema>;
