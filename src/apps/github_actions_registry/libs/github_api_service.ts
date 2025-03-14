import { delay } from "$deps/async_utils.ts";
import type { OpenapiClient } from "$deps/k8s_openapi.ts";
import type { GhComponents, GhPaths } from "./types.ts";
import { importPKCS8, SignJWT } from "jose";

export async function getLastActiveRepoNames(
  { client, org, lastPushedWithinHours }: {
    org: string;
    client: OpenapiClient<GhPaths>;
    lastPushedWithinHours: number;
  },
) {
  const repos = (await client.endpoint("/orgs/{org}/repos").method("get")({
    path: {
      org,
    },
    query: {
      per_page: 100,
      sort: "pushed",
    },
  })).data;

  return repos
    .filter((r) => r.pushed_at && new Date(r.pushed_at).getTime() > Date.now() - lastPushedWithinHours * 60 * 60 * 1000)
    .map((r) => r.name);
}

export async function createOrgRunnerRegistrationToken(
  { client, org }: { org: string; client: OpenapiClient<GhPaths> },
) {
  return (await client.endpoint("/orgs/{org}/actions/runners/registration-token").method("post")({
    path: {
      org,
    },
  })).data.token;
}

export async function getRepoPendingJobs(
  { client, owner, repo }: { owner: string; repo: string; client: OpenapiClient<GhPaths> },
) {
  const statusFilter: GhComponents["parameters"]["workflow-run-status"][] = ["queued", "in_progress"];

  const queuedOrInProgressWorkflowRuns = (await Promise.all(
    statusFilter.map(async (status) => {
      return (await client.endpoint("/repos/{owner}/{repo}/actions/runs").method("get")({
        path: {
          owner,
          repo,
        },
        query: {
          status,
        },
      })).data.workflow_runs;
    }),
  )).flat().map(({ id, repository: { name: repo }, run_attempt }) => ({
    id,
    repo,
    run_attempt,
  }));

  const jobs = (await Promise.all(queuedOrInProgressWorkflowRuns.map(async ({ id, repo, run_attempt }) => {
    return (await client.endpoint("/repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs")
      .method(
        "get",
      )({
        path: {
          owner,
          repo,
          run_id: id,
          attempt_number: run_attempt!,
        },
        query: {},
      })).data.jobs;
  }))).flat();

  return jobs.filter(({ status }) => status !== "completed").map((
    { name, labels, status, runner_name: runnerName },
  ) => ({
    name,
    labels,
    status,
    runnerName,
  }));
}

export async function* generateAccessClient(
  { client, appId, installationId, privateKeyPath, refreshIntervalSeconds, signal }: {
    appId: number;
    installationId: number;
    privateKeyPath: string;
    refreshIntervalSeconds: number;
    client: OpenapiClient<GhPaths>;
    signal?: AbortSignal;
  },
): AsyncGenerator<OpenapiClient<GhPaths>> {
  const pemEncodedKey = await Deno.readTextFile(privateKeyPath);
  const key = await importPKCS8(pemEncodedKey, "RS256");

  while (!signal?.aborted) {
    const nowSeconds = Math.floor(Date.now() / 1000);

    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(nowSeconds - 60)
      .setExpirationTime(nowSeconds + 10 * 60)
      .setIssuer(String(appId))
      .sign(key);

    const ret = await client
      .endpoint("/app/installations/{installation_id}/access_tokens").method("post")({
        path: {
          installation_id: installationId,
        },
        body: {},
      }, {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        signal,
      })
      .catch((e) => {
        if ((e instanceof DOMException) && e.name === "AbortError") {
          return Promise.resolve(null);
        }
        throw e;
      });

    if (ret === null) {
      return;
    }

    const { token: accessToken } = ret.data;

    const accessClient = client.withOptions(({ headers, ...options }) => {
      const newHeaders = new Headers(headers);
      newHeaders.append("Authorization", `token ${accessToken}`);

      return ({
        ...options,
        headers: newHeaders,
      });
    });

    yield accessClient;

    await delay(refreshIntervalSeconds * 1000, {
      signal,
    });
  }
}
