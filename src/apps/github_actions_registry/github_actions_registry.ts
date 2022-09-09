import { CliProgram, createCliAction, ExitCode } from "../../deps/cli_utils.ts";
import { createOpenapiClient, OpenapiClient } from "../../deps/k8s_openapi.ts";
import { ConnInfo, serveHttp } from "../../deps/std_http.ts";
import { constantTimeCompare, createWebhookSigner } from "../../libs/crypto_utils.ts";
import { Logger2 } from "../../libs/logger.ts";
import { agInterval, agThrottle, createReconciliationLoop, ReconciliationLoop } from "../../libs/utils.ts";
import {
  createOrgRunnerRegistrationToken,
  generateAccessClient,
  getLastActiveRepoNames,
  getRepoPendingJobs,
} from "./libs/github_api_service.ts";
import { GithubActionsRegistryParamsSchema } from "./libs/types.ts";
import { deferred } from "../../deps/async_utils.ts";
import { GhPaths, WorkflowJobEvent } from "../../deps/github_api.ts";
import { stableHash } from "../../deps/stable_hash.ts";
import { Gauge, Registry } from "../../deps/ts_prometheus.ts";
import { captureExec } from "../../deps/exec_utils.ts";

interface ReconciliationRequest {
  id: string;
  org: string;
  repo: string;
}
const GITHUB_SIGNATURE_HEADER = "X-Hub-Signature-256";
const logger = new Logger2();
const reconciliationLoopByIdMap = new Map<string, ReconciliationLoop<ReconciliationRequest>>();
let accessClientPromise = deferred<OpenapiClient<GhPaths>>();

const githubApiRateUsedGauge = Gauge.with({
  name: "github_api_rate_used_calls",
  help: "The current number of used API calls.",
});

interface QueuedJobs {
  owner: string;
  repo: string;
  jobs: Array<{
    name: string;
    labels: string[];
    status: "queued" | "in_progress" | "completed";
    runnerName: string | null;
  }>;
}

const jobsByRepoMap = new Map<string, QueuedJobs>();

function renderQueueJobsMetrics() {
  const lines = Array.from(jobsByRepoMap.values()).flatMap(({ owner, repo, jobs }) => {
    const countMap = jobs.reduce((map, job) => {
      const item = {
        name: job.name,
        labels: job.labels.slice().sort(),
        status: job.status,
      };

      const hash = stableHash(item);

      if (!map.has(hash)) {
        map.set(hash, { item, count: 1 });
      } else {
        map.set(hash, { item, count: map.get(hash)!.count + 1 });
      }

      return map;
    }, new Map<string, { item: { name: string; labels: string[]; status: string }; count: number }>());

    return Array
      .from(countMap.values()).map(({ item: { name, labels, status }, count }) => {
        return `github_actions_pending_jobs{owner=${JSON.stringify(owner)},repo=${JSON.stringify(repo)},name=${
          JSON.stringify(name)
        },labels=${JSON.stringify(`,${labels.join(",")},`)},status=${JSON.stringify(status)}} ${count}`;
      });
  });

  return [
    "# HELP github_actions_pending_jobs The current number of pending jobs.",
    "# TYPE github_actions_pending_jobs gauge",
  ].concat(lines).join("\n");
}

async function runReconciliationLoop(
  { requests, namespace, inProgressPodAnnotation }: {
    requests: AsyncGenerator<ReconciliationRequest>;
    namespace: string;
    inProgressPodAnnotation: string;
  },
) {
  for await (const { org: owner, repo } of requests) {
    const client = await accessClientPromise;

    logger.info({ message: "Getting repo pending jobs", owner, repo });
    const jobs = await getRepoPendingJobs({ client, owner, repo });

    logger.info({ message: `Got ${jobs.length} pending jobs`, jobs, owner, repo });
    jobsByRepoMap.set(`${owner}/${repo}`, { owner, repo, jobs });

    await Promise.all(
      jobs.filter((j) => j.status === "in_progress" && j.runnerName).map(async (job) => {
        try {
          const result = await captureExec({
            cmd: [
              "kubectl",
              "annotate",
              "pod",
              "-n",
              namespace,
              "--overwrite",
              job.runnerName!,
              inProgressPodAnnotation,
            ],
          });

          logger.info({
            message: "Annotated an in-progress job pod",
            namespace,
            runnerName: job.runnerName,
            inProgressPodAnnotation,
            result,
          });
        } catch (error) {
          logger.error({
            message: "Failed annotating an in-progress job pod",
            namespace,
            runnerName: job.runnerName,
            inProgressPodAnnotation,
            error,
          });
        }
      }),
    );
  }
}

const program = new CliProgram()
  .addAction(
    "run",
    createCliAction(
      GithubActionsRegistryParamsSchema,
      async (
        {
          namespace: maybeNamespace,
          inProgressPodAnnotation,
          org,
          appId,
          installationId,
          privateKeyPath,
          clientRefreshIntervalSeconds,
          perRepoMinRefreshIntervalMs,
          allReposRefreshIntervalSeconds,
          activeReposLastPushedWithinHours = 1,
          webhookSigningKeyPath,
          webhookServerPort,
          registryServerPort,
        },
        _,
        signal,
      ) => {
        const namespace = maybeNamespace ??
          (await Deno.readTextFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace")).trim();
        const sign = await createWebhookSigner(await Deno.readTextFile(webhookSigningKeyPath));

        (async () => {
          for await (const _ of agInterval(5000)) {
            const accessClient = await accessClientPromise;
            const rate = (await accessClient.endpoint("/rate_limit").method("get")({})).data.rate;
            githubApiRateUsedGauge.set(rate.used);
            logger.info({ message: "Github rate", rate });
          }
        })();

        (async () => {
          for await (
            const accessClient of generateAccessClient({
              appId,
              installationId,
              privateKeyPath,
              refreshIntervalSeconds: clientRefreshIntervalSeconds,
              client: createOpenapiClient<GhPaths>({
                baseUrl: "https://api.github.com",
                options: {
                  headers: {
                    Accept: "application/vnd.github+json",
                  },
                },
                /* middlewares: [
                  (url, init, next) => {
                    console.log("Requesting", url, init);
                    return next(url, init);
                  },
                ], */
              }),
            })
          ) {
            logger.info({ message: "Refresh access token" });
            if (accessClientPromise.state !== "pending") {
              accessClientPromise = deferred();
            }
            accessClientPromise.resolve(accessClient);
          }
        })();

        (async () => {
          for await (const _ of agInterval(allReposRefreshIntervalSeconds * 1000)) {
            logger.info({ message: "Polling from all active repos" });

            const activeRepos = await getLastActiveRepoNames({
              client: await accessClientPromise,
              org,
              lastPushedWithinHours: activeReposLastPushedWithinHours,
            });

            logger.info({ message: `Got ${activeRepos.length} active repos`, activeRepos });

            activeRepos.forEach((repo) => {
              requestReconciliation({ org, repo, id: `${org}/${repo}` });
            });
          }
        })();

        function requestReconciliation(request: ReconciliationRequest) {
          if (!reconciliationLoopByIdMap.has(request.id)) {
            logger.info({ message: "Create reconciliation loop", id: request.id, perRepoMinRefreshIntervalMs });
            const rl = createReconciliationLoop<ReconciliationRequest>();
            reconciliationLoopByIdMap.set(request.id, rl);
            runReconciliationLoop({
              requests: agThrottle(rl.loop, perRepoMinRefreshIntervalMs),
              namespace,
              inProgressPodAnnotation,
            });
          }
          reconciliationLoopByIdMap.get(request.id)!.request(request);
        }

        async function webhookHandler(request: Request, connInfo: ConnInfo): Promise<Response> {
          if (request.method === "GET" && new URL(request.url).pathname === "/healthz") {
            return new Response("OK", { status: 200 });
          }

          if (request.method === "POST") {
            const signature = request.headers.get(GITHUB_SIGNATURE_HEADER);

            if (!signature) {
              logger.warn({
                message: `Got a request with missing ${GITHUB_SIGNATURE_HEADER} header`,
                headers: request.headers,
                remoteAddr: connInfo.remoteAddr,
              });
              return new Response("Access denied", { status: 400 });
            }

            const rawBody = await request.arrayBuffer();
            const signed = await sign(rawBody);

            if (!constantTimeCompare(signed, signature)) {
              logger.warn({
                message: `Got a request with invalid ${GITHUB_SIGNATURE_HEADER} header value`,
                expected: signed,
                received: signature,
                headers: request.headers,
                remoteAddr: connInfo.remoteAddr,
              });
              return new Response("Access denied", { status: 400 });
            }

            try {
              const payload = JSON.parse(new TextDecoder().decode(rawBody));

              if (
                typeof payload === "object" && "action" in payload && "workflow_job" in payload &&
                (payload.action === "queued" || payload.action === "completed" || payload.action === "in_progress")
              ) {
                const event: WorkflowJobEvent = payload;

                const { repository: { owner: { login: org }, name: repo, full_name: id } } = event;
                logger.info({
                  message: "Request reconciliation",
                  org,
                  repo,
                  action: payload.action,
                  workflowJob: payload.workflow_job,
                });
                requestReconciliation({ org, repo, id });
              } else {
                logger.debug({ message: "Ignored webhook payload", payload });
              }

              return new Response("OK", { status: 200 });
            } catch (error) {
              logger.error({
                message: "Failed parsing request body",
                error,
                headers: request.headers,
                remoteAddr: connInfo.remoteAddr,
              });
              return new Response("Invalid request body", { status: 400 });
            }
          }

          return new Response("Not found", { status: 404 });
        }

        const registryServerPromise = (async () => {
          logger.info({ message: `Starting registry server on port ${registryServerPort}` });
          await serveHttp(async (request: Request) => {
            if (request.method === "GET") {
              const url = new URL(request.url);

              if (url.pathname === "/healthz") {
                return new Response("OK", { status: 200 });
              }

              if (url.pathname === "/metrics") {
                return new Response(
                  [
                    Registry.default.metrics(),
                    renderQueueJobsMetrics(),
                  ].join("\n\n"),
                  { status: 200 },
                );
              }

              if (url.pathname === "/runner-token") {
                const token = await createOrgRunnerRegistrationToken({ client: await accessClientPromise, org });
                return new Response(token, { status: 200 });
              }
            }

            return new Response("Not found", { status: 404 });
          }, {
            port: registryServerPort,
            signal,
            onListen({ hostname, port }) {
              logger.info({ message: `Registry server is up at http://${hostname}:${port}` });
            },
          });
        })();

        const webhookServerPromise = (async () => {
          logger.info({ message: `Starting webhook server on port ${webhookServerPort}` });
          await serveHttp(webhookHandler, {
            port: webhookServerPort,
            signal,
            onListen({ hostname, port }) {
              logger.info({ message: `Webhook server is up at http://${hostname}:${port}` });
            },
          });
        })();

        await Promise.race([registryServerPromise, webhookServerPromise]);

        return ExitCode.Zero;
      },
    ),
  );

await program.run(Deno.args);
