import { validate } from "../../../deps/validation_utils.ts";
import type { Logger } from "../../../libs/logger.ts";
import type { GitlabJob, GitlabProject } from "./types.ts";
import { GitlabJobListSchema, GitlabProjectListSchema } from "./types.ts";

export async function fetchLastActiveProjects(
  { accessToken, groupId, lastActivityWithinHours, logger }: {
    accessToken: string;
    groupId: number;
    lastActivityWithinHours: number;
    logger: Logger;
  },
): Promise<GitlabProject[]> {
  const url = new URL(`https://gitlab.com/api/v4/groups/${groupId}/projects?per_page=100&order_by=last_activity_at`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed fetching projects url=${url}`);
  }

  const body = await response.json();
  const validation = validate(GitlabProjectListSchema, body);

  if (!validation.isSuccess) {
    logger.error({
      msg: "Failed validation response schema against GitlabProjectListSchema",
      body,
      errors: validation.errors,
    });
    throw new Error("Failed validation response schema against GitlabProjectListSchema");
  }

  return validation.value
    .filter((p) => new Date(p.last_activity_at).getTime() > Date.now() - lastActivityWithinHours * 60 * 60 * 1000);
}

export async function fetchProjectPendingJobs(
  { accessToken, projectId, logger }: { accessToken: string; projectId: number; logger: Logger },
): Promise<GitlabJob[]> {
  const results = await Promise.all(["pending", "running", "waiting_for_resource"].map(async (status) => {
    const url = new URL(`https://gitlab.com/api/v4/projects/${projectId}/jobs?scope=${status}&per_page=100`);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed fetching jobs url=${url}`);
    }

    const body = await response.json();
    const validation = validate(GitlabJobListSchema, body);

    if (!validation.isSuccess) {
      logger.error({
        msg: "Failed validation response schema against GitlabJobListSchema",
        body,
        errors: validation.errors,
      });
      throw new Error("Failed validation response schema against GitlabJobListSchema");
    }

    return validation.value;
  }));

  return results.flat();
}
