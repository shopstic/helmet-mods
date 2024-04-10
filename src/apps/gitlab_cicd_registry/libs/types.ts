import type { Static } from "../../../deps/typebox.ts";
import { FlexObject, Type } from "../../../deps/typebox.ts";

export const GitlabCicdRegistryParamsSchema = Type.Object({
  groupId: Type.Number(),
  accessToken: Type.String({ minLength: 1 }),
  allProjectsRefreshIntervalSeconds: Type.Number({ minimum: 1 }),
  activeProjectLastPushedWithinHours: Type.Number({ minimum: 1 }),
  perProjectMinRefreshIntervalMs: Type.Number({ minimum: 1 }),
  webhookSecretToken: Type.String({ minLength: 1 }),
  webhookServerPort: Type.Number({ minimum: 0, maximum: 65535 }),
  registryServerPort: Type.Number({ minimum: 0, maximum: 65535 }),
  busyJobAnnotation: Type.String({ minLength: 1 }),
  namespace: Type.Optional(Type.String({ minLength: 1 })),
});

export type GitlabCicdRegistryParams = Static<typeof GitlabCicdRegistryParamsSchema>;

export const GitlabWebhookBuildSchema = FlexObject({
  object_kind: Type.Literal("build"),
  project_id: Type.Number(),
  project_name: Type.String({ minLength: 1 }),
});

export const GitlabProjectSchema = FlexObject({
  id: Type.Number(),
  name: Type.String({ minLength: 1 }),
  last_activity_at: Type.String({ format: "date-time" }),
});

export type GitlabProject = Static<typeof GitlabProjectSchema>;

export const GitlabProjectListSchema = Type.Array(GitlabProjectSchema);

export const GitlabJobSchema = FlexObject({
  name: Type.String({ minLength: 1 }),
  stage: Type.String({ minLength: 1 }),
  status: Type.Union([
    Type.Literal("created"),
    Type.Literal("pending"),
    Type.Literal("running"),
    Type.Literal("failed"),
    Type.Literal("success"),
    Type.Literal("skipped"),
    Type.Literal("waiting_for_resource"),
    Type.Literal("manual"),
    Type.Literal("canceled"),
  ]),
  tag_list: Type.Array(Type.String({ minLength: 1 })),
});

export type GitlabJob = Static<typeof GitlabJobSchema>;

export const GitlabJobListSchema = Type.Array(GitlabJobSchema);
