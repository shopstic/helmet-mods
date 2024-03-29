import { inheritExec, NonZeroExitError } from "../../deps/exec_utils.ts";
import { GitlabCicdRegistryParams } from "./libs/types.ts";
import { dirname, fromFileUrl } from "../../deps/std_path.ts";
import { watchOsSignal } from "../../deps/std_signal.ts";

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
    Object.entries(args).map(([k, v]) => `--${k}=${v}`),
  ),
  cwd: dirname(fromFileUrl(import.meta.url)),
  abortSignal: abortController.signal,
}).catch((e) => {
  if (!(e instanceof NonZeroExitError) || e.exitCode !== 123) {
    return Promise.reject(e);
  }
});

const interruptionPromise = (async () => {
  for await (const _ of watchOsSignal("SIGTERM", "SIGINT")) {
    abortController.abort();
    await mainPromise;
  }
})();

await Promise.race([interruptionPromise, mainPromise]);
