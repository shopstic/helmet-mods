import { CliProgram, createCliAction } from "../../deps/cli_utils.ts";
import { GrafanaApiPaths } from "../../deps/grafana_openapi.ts";
import { createOpenapiClient, k8sApiWatch, OpenapiClient, OpenapiOperationError } from "../../deps/k8s_openapi.ts";
import { Logger } from "../../libs/logger.ts";
import { exhaustiveMatchingGuard } from "../../libs/utils.ts";
import { GrafanaSyncerParamsSchema, Paths } from "./libs/types.ts";

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

export async function* watchDashboards(
  { client, signal, namespace, labelSelector, fieldSelector }: {
    client: OpenapiClient<Paths>;
    signal: AbortSignal;
    namespace: string;
    labelSelector?: string;
    fieldSelector?: string;
  },
): AsyncGenerator<DashboardEvent> {
  try {
    const events = k8sApiWatch(
      client.endpoint("/apis/shopstic.com/v1/namespaces/{namespace}/grafanadashboards").method("get"),
    )({
      path: {
        namespace,
      },
      query: {
        watch: true,
        ...(labelSelector ? { labelSelector } : {}),
        ...(fieldSelector ? { fieldSelector } : {}),
      },
    }, {
      signal,
    });

    for await (const event of events) {
      if (event.type === "ADDED" || event.type === "MODIFIED") {
        const { name, namespace, resourceVersion, uid, finalizers } = event.object.metadata;

        if (event.object.metadata.deletionTimestamp) {
          yield {
            action: "delete",
            name,
            namespace,
            uid: uid!,
          } satisfies DeleteDashboard;
        } else {
          yield {
            action: "upsert",
            dashboard: event.object.spec.dashboard,
            name,
            namespace,
            uid: uid!,
            folderId: event.object.spec.folderId,
            folderUid: event.object.spec.folderUid,
            resourceVersion: resourceVersion!,
            message:
              `Updated by GrafanaSyncer. CRD name=${name} namespace=${namespace} resourceVersion=${resourceVersion}`,
            isFirstSync: !finalizers || !finalizers.includes(FINALIZER_NAME),
          } satisfies UpsertDashboard;
        }
      } else if (event.type === "DELETED") {
        // Ignore
      } else {
        exhaustiveMatchingGuard(event.type);
      }
    }
  } catch (e) {
    if (!(e instanceof DOMException) || e.name !== "AbortError") {
      throw e;
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
        _,
        signal,
      ) => {
        const logger = new Logger();
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

        while (true) {
          logger.info({
            msg: "Watching",
            namespace,
            labelSelector,
            fieldSelector,
            grafanaApiServerBaseUrl,
            k8sApiServerBaseUrl,
          });

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

              logger.info({
                msg: "Got upsert event",
                name,
                namespace,
                uid,
                folderId,
                folderUid,
                resourceVersion,
                isFirstSync,
              });

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

                logger.info({ msg: "Synced dashboard to Grafana", name, namespace, resourceVersion });
              } else {
                logger.info({ msg: "No change since last sync, nothing to do", name, namespace, resourceVersion });
              }

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

                logger.info({ msg: "Patched CRD with finalizer", name, namespace });
              }
            } else if (event.action === "delete") {
              const { name, namespace, uid } = event;

              logger.info({ msg: "Got delete event", name, namespace, uid });

              try {
                await grafanaClient.endpoint("/dashboards/uid/{uid}").method("delete")({
                  path: {
                    uid: event.uid,
                  },
                });

                logger.info({ msg: "Deleted dashboard", name, namespace, uid });
              } catch (e) {
                if (e instanceof OpenapiOperationError && e.status === 404) {
                  logger.info({ msg: "Dashboard doesn't exist, nothing to do", name, namespace, uid });
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
              exhaustiveMatchingGuard(event);
            }
          }
        }
      },
    ),
  )
  .run(Deno.args);
