import { CliProgram, createCliAction, ExitCode } from "$deps/cli_utils.ts";
import type { paths as GrafanaApiPaths } from "$libs/grafana/openapi_types.ts";
import { assertUnreachable } from "$libs/utils.ts";
import { createOpenapiClient, type OpenapiClient, OpenapiOperationError } from "$deps/k8s_openapi.ts";
import { GrafanaSyncerParamsSchema } from "./libs/schemas.ts";
import type { GrafanaDashboard, Paths } from "./libs/types.ts";
import { k8sControllerWatch } from "@wok/k8s-utils/controller";
import { getDefaultLogger } from "@wok/utils/logger";

interface UpsertDashboard {
  action: "upsert";
  name: string;
  namespace: string;
  uid: string;
  dashboard: Record<string, unknown>;
  folderId?: number;
  folderUid?: string;
  message: string;
  resourceVersion: string;
  isFirstSync: boolean;
}

interface DeleteDashboard {
  action: "delete";
  uid: string;
  name: string;
  namespace: string;
}

type DashboardEvent = UpsertDashboard | DeleteDashboard;

const FINALIZER_NAME = "grafanasyncer.shopstic.com";
const logger = getDefaultLogger();

function toDashboardEvent(dashboard: GrafanaDashboard): DashboardEvent {
  const { name, namespace, resourceVersion, uid, finalizers } = dashboard.metadata;

  if (dashboard.metadata.deletionTimestamp) {
    return {
      action: "delete",
      name,
      namespace,
      uid: uid!,
    } satisfies DeleteDashboard;
  } else {
    return {
      action: "upsert",
      dashboard: dashboard.spec.dashboard,
      name,
      namespace,
      uid: uid!,
      folderId: dashboard.spec.folderId,
      folderUid: dashboard.spec.folderUid,
      resourceVersion: resourceVersion!,
      message: `Updated by GrafanaSyncer. CRD name=${name} namespace=${namespace} resourceVersion=${resourceVersion}`,
      isFirstSync: !finalizers || !finalizers.includes(FINALIZER_NAME),
    } satisfies UpsertDashboard;
  }
}
export async function* watchDashboards(
  { client, signal, namespace, labelSelector, fieldSelector }: {
    client: OpenapiClient<Paths>;
    signal: AbortSignal;
    namespace: string;
    labelSelector?: string;
    fieldSelector?: string;
  },
): AsyncGenerator<DashboardEvent> {
  const events = k8sControllerWatch(
    client.endpoint("/apis/shopstic.com/v1/namespaces/{namespace}/grafanadashboards").method("get"),
  )({
    path: {
      namespace,
    },
    query: {
      ...(labelSelector ? { labelSelector } : {}),
      ...(fieldSelector ? { fieldSelector } : {}),
      timeoutSeconds: 30,
    },
  }, {
    signal,
  });

  for await (const event of events) {
    if (event.type === "ADDED" || event.type === "MODIFIED") {
      yield toDashboardEvent(event.object);
    } else if (event.type === "DELETED" || event.type === "BOOKMARK" || event.type === "INITIAL_LIST_END") {
      // Ignore
    } else {
      assertUnreachable(event.type);
    }
  }
}

await new CliProgram()
  .addAction(
    "run",
    createCliAction(
      GrafanaSyncerParamsSchema,
      async (
        {
          grafanaApiServerBaseUrl,
          grafanaBearerToken,
          k8sApiServerBaseUrl,
          namespace: maybeNamespace,
          labelSelector,
          fieldSelector,
        },
        signal,
      ) => {
        const namespace = maybeNamespace ??
          (await Deno.readTextFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace")).trim();

        const grafanaClient = createOpenapiClient<GrafanaApiPaths>({
          baseUrl: grafanaApiServerBaseUrl,
          options: {
            headers: {
              Authorization: `Bearer ${grafanaBearerToken}`,
            },
          },
        });

        const k8sClient = createOpenapiClient<Paths>({
          baseUrl: k8sApiServerBaseUrl,
        });

        const mergePatchK8sClient = k8sClient
          .withOptions((o) => {
            const newHeaders = new Headers(o.headers);
            newHeaders.append("Content-Type", "application/merge-patch+json");
            return {
              ...o,
              headers: newHeaders,
            };
          });

        logger.info?.ctx({
          namespace,
          labelSelector,
          fieldSelector,
          grafanaApiServerBaseUrl,
          k8sApiServerBaseUrl,
        }, "Starting reconcile loop");

        for await (
          const event of watchDashboards({
            client: k8sClient,
            namespace,
            signal,
            labelSelector,
            fieldSelector,
          })
        ) {
          if (event.action === "upsert") {
            const { name, namespace, uid, folderId, folderUid, resourceVersion, isFirstSync, message } = event;

            logger.info?.ctx({
              name,
              namespace,
              uid,
              folderId,
              folderUid,
              resourceVersion,
              isFirstSync,
            }, "Got upsert event");

            if (isFirstSync) {
              await mergePatchK8sClient
                .endpoint("/apis/shopstic.com/v1/namespaces/{namespace}/grafanadashboards/{name}")
                .method("patch")({
                  path: {
                    namespace: event.namespace,
                    name: event.name,
                  },
                  query: {},
                  body: {
                    metadata: {
                      finalizers: [FINALIZER_NAME],
                    },
                  },
                });

              logger.info?.ctx({
                name,
                namespace,
              }, "Patched CRD with finalizer");
            } else {
              const existingDashboard = await (async () => {
                try {
                  return (await grafanaClient.endpoint("/dashboards/uid/{uid}").method("get")({
                    path: { uid },
                  })).data.dashboard;
                } catch (e) {
                  if (e instanceof OpenapiOperationError && e.status === 404) {
                    return;
                  } else {
                    throw e;
                  }
                }
              })();

              if (!existingDashboard || existingDashboard.k8sCrdResourceVersion !== resourceVersion) {
                await grafanaClient.endpoint("/dashboards/db").method("post")({
                  body: {
                    dashboard: {
                      ...event.dashboard,
                      id: existingDashboard?.id,
                      version: existingDashboard?.version,
                      k8sCrdResourceVersion: resourceVersion,
                      uid,
                    },
                    folderId,
                    folderUid,
                    message,
                    overwrite: false,
                  },
                });

                logger.info?.ctx({
                  name,
                  namespace,
                  resourceVersion,
                }, "Synced dashboard to Grafana");
              } else {
                logger.info?.ctx({
                  name,
                  namespace,
                  resourceVersion,
                }, "No change since last sync, nothing to do");
              }
            }
          } else if (event.action === "delete") {
            const { name, namespace, uid } = event;

            logger.info?.ctx({
              name,
              namespace,
              uid,
            }, "Got delete event");

            try {
              await grafanaClient.endpoint("/dashboards/uid/{uid}").method("delete")({
                path: {
                  uid: event.uid,
                },
              });

              logger.info?.ctx({
                name,
                namespace,
                uid,
              }, "Deleted dashboard");
            } catch (e) {
              if (e instanceof OpenapiOperationError && e.status === 404) {
                logger.info?.ctx({
                  name,
                  namespace,
                  uid,
                }, "Dashboard doesn't exist, nothing to do");
              } else {
                throw e;
              }
            }

            await mergePatchK8sClient
              .endpoint("/apis/shopstic.com/v1/namespaces/{namespace}/grafanadashboards/{name}")
              .method("patch")({
                path: { namespace, name },
                query: {},
                body: {
                  metadata: {
                    finalizers: [],
                  },
                },
              });
          } else {
            assertUnreachable(event);
          }
        }

        return ExitCode.One;
      },
    ),
  )
  .run(Deno.args);
