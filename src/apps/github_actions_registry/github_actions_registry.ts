import { CliProgram, createCliAction, ExitCode } from "../../deps/cli_utils.ts";
import type { OpenapiClient } from "../../deps/k8s_openapi.ts";
import { createOpenapiClient } from "../../deps/k8s_openapi.ts";
import { constantTimeCompare, createWebhookSigner } from "../../libs/crypto_utils.ts";
import { Logger } from "../../libs/logger.ts";
import type { ReconciliationLoop } from "../../libs/utils.ts";
import { agInterval, agThrottle, createReconciliationLoop } from "../../libs/utils.ts";
import {
  createOrgRunnerRegistrationToken,
  generateAccessClient,
  getLastActiveRepoNames,
  getRepoPendingJobs,
} from "./libs/github_api_service.ts";
import { GithubActionsRegistryParamsSchema } from "./libs/schemas.ts";
import type { GhPaths, WorkflowJobEvent } from "../../deps/github_api.ts";
import { stableHash } from "../../deps/stable_hash.ts";
import { Gauge, Registry } from "../../deps/ts_prometheus.ts";
import { captureExec } from "../../deps/exec_utils.ts";
import { deferred } from "../../deps/async_utils.ts";

interface ReconciliationRequest {
  id: string;
  org: string;
  repo: string;
}
const GITHUB_SIGNATURE_HEADER = "X-Hub-Signature-256";
const logger = new Logger();
const reconciliationLoopByIdMap = new Map<string, ReconciliationLoop<ReconciliationRequest>>();
let accessClientPromise = deferred<OpenapiClient<GhPaths>>();

const githubApiRateUsedGauge = Gauge.with({
  name: "github_api_rate_used_calls",
  help: "The current number of used API calls.",
});

interface GithubJob {
  name: string;
  labels: string[];
  status: "queued" | "in_progress" | "completed";
  runnerName: string | null;
}

interface GithubWorkflow {
  owner: string;
  repo: string;
  jobs: Array<GithubJob>;
}

const workflowsByRepoMap = new Map<string, GithubWorkflow>();

function renderQueueJobsMetrics() {
  const lines = Array.from(workflowsByRepoMap.values()).flatMap(({ owner, repo, jobs }) => {
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
    }, new Map<string, { item: Omit<GithubJob, "runnerName">; count: number }>());

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

async function runReconciliationLoop(requests: AsyncGenerator<ReconciliationRequest>) {
  for await (const { org: owner, repo } of requests) {
    const client = await accessClientPromise.promise;

    logger.info({ msg: "Getting repo pending jobs", owner, repo });
    const jobs = await getRepoPendingJobs({ client, owner, repo });

    logger.info({ msg: `Got ${jobs.length} pending jobs`, jobs, owner, repo });
    workflowsByRepoMap.set(`${owner}/${repo}`, { owner, repo, jobs });
  }
}

const program = new CliProgram()
  .addAction(
    "run",
    createCliAction(
      GithubActionsRegistryParamsSchema,
      async (
        {
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
          busyJobAnnotation,
          namespace: maybeNamespace,
        },
        _,
        signal,
      ) => {
        const namespace = maybeNamespace ??
          (await Deno.readTextFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace")).trim();
        const signWebhookRequest = await createWebhookSigner(await Deno.readTextFile(webhookSigningKeyPath));

        (async () => {
          for await (const _ of agInterval(5000)) {
            const accessClient = await accessClientPromise.promise;
            const rate = (await accessClient.endpoint("/rate_limit").method("get")({})).data.rate;
            githubApiRateUsedGauge.set(rate.used);
            logger.info({ msg: "Github rate", rate });
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
            logger.info({ msg: "Refresh access token" });
            if (accessClientPromise.state !== "pending") {
              accessClientPromise = deferred();
            }
            accessClientPromise.resolve(accessClient);
          }
        })();

        (async () => {
          for await (const _ of agInterval(allReposRefreshIntervalSeconds * 1000)) {
            logger.info({ msg: "Polling from all active repos" });

            const activeRepos = await getLastActiveRepoNames({
              client: await accessClientPromise.promise,
              org,
              lastPushedWithinHours: activeReposLastPushedWithinHours,
            });

            logger.info({ msg: `Got ${activeRepos.length} active repos`, activeRepos });

            activeRepos.forEach((repo) => {
              requestReconciliation({ org, repo, id: `${org}/${repo}` });
            });
          }
        })();

        function requestReconciliation(request: ReconciliationRequest) {
          if (!reconciliationLoopByIdMap.has(request.id)) {
            logger.info({ msg: "Create reconciliation loop", id: request.id, perRepoMinRefreshIntervalMs });
            const rl = createReconciliationLoop<ReconciliationRequest>();
            reconciliationLoopByIdMap.set(request.id, rl);
            runReconciliationLoop(agThrottle(rl.loop, perRepoMinRefreshIntervalMs));
          }
          reconciliationLoopByIdMap.get(request.id)!.request(request);
        }

        async function webhookHandler(request: Request, connInfo: Deno.ServeHandlerInfo): Promise<Response> {
          if (request.method === "GET" && new URL(request.url).pathname === "/healthz") {
            return new Response("OK", { status: 200 });
          }

          if (request.method === "POST") {
            const signature = request.headers.get(GITHUB_SIGNATURE_HEADER);

            if (!signature) {
              logger.warn({
                msg: `Got a request with missing ${GITHUB_SIGNATURE_HEADER} header`,
                headers: request.headers,
                remoteAddr: connInfo.remoteAddr,
              });
              return new Response("Access denied", { status: 400 });
            }

            const rawBody = await request.arrayBuffer();
            const signed = await signWebhookRequest(rawBody);

            if (!constantTimeCompare(signed, signature)) {
              logger.warn({
                msg: `Got a request with invalid ${GITHUB_SIGNATURE_HEADER} header value`,
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
                  msg: "Request reconciliation",
                  org,
                  repo,
                  action: payload.action,
                  workflowJob: payload.workflow_job,
                });
                requestReconciliation({ org, repo, id });
              } else {
                logger.debug({ msg: "Ignored webhook payload", payload });
              }

              return new Response("OK", { status: 200 });
            } catch (error) {
              logger.error({
                msg: "Failed parsing request body",
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
          logger.info({ msg: `Starting registry server on port ${registryServerPort}` });
          await Deno.serve({
            port: registryServerPort,
            signal,
            onListen({ hostname, port }) {
              logger.info({ msg: `Registry server is up at http://${hostname}:${port}` });
            },
          }, async (request: Request) => {
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
                const token = await createOrgRunnerRegistrationToken({
                  client: await accessClientPromise.promise,
                  org,
                });
                return new Response(token, { status: 200 });
              }

              if (url.pathname === "/annotate-busy-job") {
                const jobName = url.searchParams.get("jobName");

                if (!jobName) {
                  return new Response("jobName query parameter is required", { status: 400 });
                }

                try {
                  const result = await captureExec({
                    cmd: [
                      "kubectl",
                      "annotate",
                      "job",
                      "-n",
                      namespace,
                      jobName,
                      busyJobAnnotation,
                    ],
                  });

                  return new Response(JSON.stringify(result), {
                    status: 200,
                    headers: {
                      "content-type": "application/json",
                    },
                  });
                } catch (e) {
                  return new Response(JSON.stringify(e), {
                    status: 400,
                    headers: {
                      "content-type": "application/json",
                    },
                  });
                }
              }
            }

            return new Response("Not found", { status: 404 });
          }).finished;
        })();

        const webhookServerPromise = (async () => {
          logger.info({ msg: `Starting webhook server on port ${webhookServerPort}` });
          await Deno.serve({
            port: webhookServerPort,
            signal,
            onListen({ hostname, port }) {
              logger.info({ msg: `Webhook server is up at http://${hostname}:${port}` });
            },
          }, webhookHandler).finished;
        })();

        await Promise.race([registryServerPromise, webhookServerPromise]);

        return ExitCode.Zero;
      },
    ),
  );

await program.run(Deno.args);
