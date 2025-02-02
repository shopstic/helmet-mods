import { inheritExec, NonZeroExitError } from "$deps/exec_utils.ts";
import type { GitlabCicdRegistryParams } from "./libs/schemas.ts";
import { dirname, fromFileUrl } from "$deps/std_path.ts";
import { toParamCase } from "$deps/case.ts";

const accessToken = Deno.env.get("GITLAB_TEST_ACCESS_TOKEN");
if (!accessToken) {
  throw new Error("GITLAB_TEST_ACCESS_TOKEN env var is missing");
}

const groupId = Deno.env.get("GITLAB_TEST_GROUP_ID");
if (!groupId) {
  throw new Error("GITLAB_TEST_GROUP_ID env var is missing");
}

const webhookSecretToken = Deno.env.get("GITLAB_TEST_WEBHOOK_SECRET_TOKEN");
if (!webhookSecretToken) {
  throw new Error("GITLAB_TEST_WEBHOOK_SECRET_TOKEN env var is missing");
}

const args: GitlabCicdRegistryParams = {
  groupId: parseInt(groupId),
  accessToken,
  allProjectsRefreshIntervalSeconds: 360,
  activeProjectLastPushedWithinHours: 24,
  perProjectMinRefreshIntervalMs: 2000,
  webhookSecretToken: webhookSecretToken,
  webhookServerPort: 9876,
  registryServerPort: 9875,
  busyJobAnnotation: "helmet.run/gitlab-cicd-job-busy=true",
  namespace: "gitlab-cicd",
};

const abortController = new AbortController();

const mainPromise = inheritExec({
  cmd: ["deno", "run", "-A", "--check", "./gitlab_cicd_registry.ts", "run"].concat(
    Object.entries(args).map(([k, v]) => `--${toParamCase(k)}=${v}`),
  ),
  cwd: dirname(fromFileUrl(import.meta.url)),
  abortSignal: abortController.signal,
}).catch((e: Error) => {
  if (!(e instanceof NonZeroExitError) || e.exitCode !== 123) {
    return Promise.reject(e);
  }
});

const interruptionPromise = (async () => {
  const deferred = Promise.withResolvers<void>();

  Deno.addSignalListener("SIGTERM", deferred.resolve);
  Deno.addSignalListener("SIGINT", deferred.resolve);

  await deferred.promise;

  abortController.abort();
  await mainPromise;
})();

await Promise.race([interruptionPromise, mainPromise]);
