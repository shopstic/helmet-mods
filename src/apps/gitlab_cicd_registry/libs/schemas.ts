import { Arr, Lit, Num, Obj, Opt, PartObj, Str, Uni } from "$deps/schema.ts";

export const GitlabCicdRegistryParamsSchema = {
  groupId: Num(),
  accessToken: Str({ minLength: 1 }),
  allProjectsRefreshIntervalSeconds: Num({ minimum: 1 }),
  activeProjectLastPushedWithinHours: Num({ minimum: 1 }),
  perProjectMinRefreshIntervalMs: Num({ minimum: 1 }),
  webhookSecretToken: Str({ minLength: 1 }),
  webhookServerPort: Num({ minimum: 0, maximum: 65535 }),
  registryServerPort: Num({ minimum: 0, maximum: 65535 }),
  busyJobAnnotation: Str({ minLength: 1 }),
  namespace: Opt(Str({ minLength: 1 })),
};

const GitlabCicdRegistryParamsSchemaObj = Obj(GitlabCicdRegistryParamsSchema);
export type GitlabCicdRegistryParams = typeof GitlabCicdRegistryParamsSchemaObj.infer;

export const GitlabWebhookBuildSchema = PartObj({
  object_kind: Lit("build"),
  project_id: Num(),
  project_name: Str({ minLength: 1 }),
});

export const GitlabProjectSchema = PartObj({
  id: Num(),
  name: Str({ minLength: 1 }),
  last_activity_at: Str({ format: "date-time" }),
});

export type GitlabProject = typeof GitlabProjectSchema.infer;

export const GitlabProjectListSchema = Arr(GitlabProjectSchema);

export const GitlabJobSchema = PartObj({
  name: Str({ minLength: 1 }),
  stage: Str({ minLength: 1 }),
  status: Uni([
    Lit("created"),
    Lit("pending"),
    Lit("running"),
    Lit("failed"),
    Lit("success"),
    Lit("skipped"),
    Lit("waiting_for_resource"),
    Lit("manual"),
    Lit("canceled"),
  ]),
  tag_list: Arr(Str({ minLength: 1 })),
});

export type GitlabJob = typeof GitlabJobSchema.infer;

export const GitlabJobListSchema = Arr(GitlabJobSchema);
