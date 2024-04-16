import { CliProgram, createCliAction, ExitCode } from "../../deps/cli_utils.ts";
import { captureExec } from "../../deps/exec_utils.ts";
import { stableHash } from "../../deps/stable_hash.ts";
import { validate } from "../../deps/validation_utils.ts";
import { constantTimeCompare } from "../../libs/crypto_utils.ts";
import { Logger } from "../../libs/logger.ts";
import type { ReconciliationLoop } from "../../libs/utils.ts";
import { agInterval, agThrottle, createReconciliationLoop } from "../../libs/utils.ts";
import type { GitlabJob } from "./libs/schemas.ts";
import { GitlabCicdRegistryParamsSchema, GitlabWebhookBuildSchema } from "./libs/schemas.ts";
import { fetchLastActiveProjects, fetchProjectPendingJobs } from "./libs/gitlab_api_service.ts";

const GITLAB_WEBHOOK_TOKEN_HEADER = "X-Gitlab-Token";
const logger = new Logger();

interface ReconciliationRequest {
  accessToken: string;
  projectId: number;
  projectName: string;
}
const reconciliationLoopByIdMap = new Map<number, ReconciliationLoop<ReconciliationRequest>>();

interface GitlabProjectJobs {
  projectId: number;
  projectName: string;
  jobs: Array<GitlabJob>;
}

const jobsByProjectIdMap = new Map<string, GitlabProjectJobs>();

async function runReconciliationLoop(requests: AsyncGenerator<ReconciliationRequest>) {
  for await (const { projectId, projectName, accessToken } of requests) {
    logger.info({ msg: "Getting project pending jobs", projectId, projectName });
    const jobs = await fetchProjectPendingJobs({ accessToken, projectId, logger });

    logger.info({ msg: `Got ${jobs.length} pending jobs`, jobs, projectId, projectName });
    jobsByProjectIdMap.set(String(projectId), { projectId, projectName, jobs });
  }
}

interface GitlabJobMetric {
  name: string;
  stage: string;
  tags: string[];
  status: GitlabJob["status"];
}

function renderQueueJobsMetrics() {
  const lines = Array.from(jobsByProjectIdMap.values()).flatMap(({ projectId, projectName, jobs }) => {
    const countMap = jobs.reduce((map, job) => {
      const item: GitlabJobMetric = {
        name: job.name,
        stage: job.stage,
        tags: job.tag_list.slice().sort(),
        status: job.status,
      };

      const hash = stableHash(item);

      if (!map.has(hash)) {
        map.set(hash, { item, count: 1 });
      } else {
        map.set(hash, { item, count: map.get(hash)!.count + 1 });
      }

      return map;
    }, new Map<string, { item: GitlabJobMetric; count: number }>());

    return Array
      .from(countMap.values()).map(({ item: { name, stage, tags, status }, count }) => {
        const labels: Record<string, string> = {
          projectId: String(projectId),
          projectName,
          name,
          stage,
          tags: `,${tags.join(",")},`,
          status,
        };

        return `gitlab_cicd_pending_jobs{${
          Object.entries(labels).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")
        }} ${count}`;
      });
  });

  return [
    "# HELP gitlab_cicd_pending_jobs The current number of pending jobs.",
    "# TYPE gitlab_cicd_pending_jobs gauge",
  ].concat(lines).join("\n");
}

const program = new CliProgram()
  .addAction(
    "run",
    createCliAction(
      GitlabCicdRegistryParamsSchema,
      async (
        {
          groupId,
          accessToken,
          allProjectsRefreshIntervalSeconds,
          activeProjectLastPushedWithinHours,
          perProjectMinRefreshIntervalMs,
          webhookSecretToken,
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

        function requestReconciliation(request: ReconciliationRequest) {
          if (!reconciliationLoopByIdMap.has(request.projectId)) {
            logger.info({
              msg: "Create reconciliation loop",
              projectId: request.projectId,
              projectName: request.projectName,
              perProjectMinRefreshIntervalMs,
            });
            const rl = createReconciliationLoop<ReconciliationRequest>();
            reconciliationLoopByIdMap.set(request.projectId, rl);
            void runReconciliationLoop(agThrottle(rl.loop, perProjectMinRefreshIntervalMs));
          }

          reconciliationLoopByIdMap.get(request.projectId)!.request(request);
        }

        const periodicProjectsRefreshPromise = (async () => {
          for await (const _ of agInterval(allProjectsRefreshIntervalSeconds * 1000)) {
            logger.info({ msg: "Fetching all active projects" });
            const activeProjects = await fetchLastActiveProjects({
              accessToken,
              groupId,
              lastActivityWithinHours: activeProjectLastPushedWithinHours,
              logger,
            });

            logger.info({
              msg: `Got ${activeProjects.length} active projects`,
              projects: activeProjects.map(({ id, name, last_activity_at }) => ({
                id,
                name,
                lastActivityAt: last_activity_at,
              })),
            });

            activeProjects.forEach((project) => {
              requestReconciliation({ accessToken, projectId: project.id, projectName: project.name });
            });
          }
        })();

        async function webhookHandler(request: Request, connInfo: Deno.ServeHandlerInfo): Promise<Response> {
          if (request.method === "GET" && new URL(request.url).pathname === "/healthz") {
            return new Response("OK", { status: 200 });
          }

          if (request.method === "POST") {
            const receivedToken = request.headers.get(GITLAB_WEBHOOK_TOKEN_HEADER);

            if (!receivedToken) {
              logger.warn({
                msg: `Got a request with missing ${GITLAB_WEBHOOK_TOKEN_HEADER} header`,
                headers: request.headers,
                remoteAddr: connInfo.remoteAddr,
              });
              return new Response("Access denied", { status: 400 });
            }

            if (!constantTimeCompare(webhookSecretToken, receivedToken)) {
              logger.warn({
                msg: `Got a request with invalid ${GITLAB_WEBHOOK_TOKEN_HEADER} header value`,
                received: receivedToken,
                headers: request.headers,
                remoteAddr: connInfo.remoteAddr,
              });
              return new Response("Access denied", { status: 400 });
            }

            try {
              const payload = await request.json();
              const validation = validate(GitlabWebhookBuildSchema, payload);

              if (!validation.isSuccess) {
                logger.warn({
                  msg: "Got a request with an unexpected payload",
                  payload: payload,
                  headers: request.headers,
                  remoteAddr: connInfo.remoteAddr,
                });
              } else {
                const projectId = validation.value.project_id;
                const projectName = validation.value.project_name;

                logger.info({
                  msg: "Got a build webhook request, going to reconcile",
                  projectId,
                  projectName,
                });
                requestReconciliation({ accessToken, projectId, projectName });
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
                return new Response(renderQueueJobsMetrics(), { status: 200 });
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

        await Promise.race([periodicProjectsRefreshPromise, webhookServerPromise, registryServerPromise]);

        return ExitCode.Zero;
      },
    ),
  );

await program.run(Deno.args);
