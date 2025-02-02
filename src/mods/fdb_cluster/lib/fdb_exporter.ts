import type { K8s, K8sDeployment, K8sImagePullPolicy, K8sService } from "$deps/helmet.ts";
import { createK8sDeployment, createK8sService } from "$deps/helmet.ts";
import type { ServiceMonitorV1 } from "../../prometheus_operator/prometheus_operator.ts";
import { createServiceMonitorV1 } from "../../prometheus_operator/prometheus_operator.ts";

export interface FdbExporterResources {
  service: K8sService;
  deployment: K8sDeployment;
  serviceMonitor?: ServiceMonitorV1;
}

export function createFdbExporterResources(
  {
    baseLabels,
    name,
    namespace,
    dedupProxyImage,
    connectionStringConfigMapRef,
    image,
    imagePullPolicy,
    createServiceMonitor,
    nodeSelector,
    tolerations,
  }: {
    name: string;
    namespace: string;
    dedupProxyImage: string;
    baseLabels: Record<string, string>;
    connectionStringConfigMapRef: K8s["core.v1.ConfigMapKeySelector"];
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
    createServiceMonitor: boolean;
    nodeSelector?: Record<string, string>;
    tolerations?: K8s["core.v1.Toleration"][];
  },
): FdbExporterResources {
  const labels = {
    ...baseLabels,
    "app.kubernetes.io/component": "exporter",
  };

  const probe = {
    httpGet: {
      path: "/metrics",
      port: 8080,
      scheme: "HTTP",
    },
    initialDelaySeconds: 1,
    periodSeconds: 15,
    timeoutSeconds: 15,
    successThreshold: 1,
    failureThreshold: 3,
  };

  const proxyPort = 8080;
  const backendExporterPort = 8081;
  const portName = "metrics";

  const deployment = createK8sDeployment({
    metadata: {
      name,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: labels,
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          nodeSelector,
          tolerations,
          containers: [{
            name: "exporter",
            image,
            imagePullPolicy,
            livenessProbe: probe,
            readinessProbe: probe,
            env: [
              {
                name: "FDB_METRICS_LISTEN",
                value: `:${backendExporterPort}`,
              },
              {
                name: "FDB_CONNECTION_STRING",
                valueFrom: {
                  configMapKeyRef: connectionStringConfigMapRef,
                },
              },
            ],
          }, {
            name: "dedup-proxy",
            image: dedupProxyImage,
            livenessProbe: probe,
            readinessProbe: probe,
            ports: [
              {
                containerPort: proxyPort,
                name: portName,
                protocol: "TCP",
              },
            ],
            args: [
              `--port=${proxyPort}`,
              `--proxyTarget=http://localhost:${backendExporterPort}`,
              `--targetRequestTimeoutMs=10000`,
            ],
          }],
        },
      },
    },
  });

  const service = createK8sService({
    metadata: {
      name,
      labels,
    },
    spec: {
      type: "ClusterIP",
      ports: [
        {
          name: portName,
          port: 80,
          protocol: "TCP",
          targetPort: portName,
        },
      ],
      selector: labels,
    },
  });

  const serviceMonitor = createServiceMonitor
    ? createServiceMonitorV1({
      metadata: {
        name,
      },
      spec: {
        endpoints: [
          {
            honorLabels: true,
            interval: "10s",
            metricRelabelings: [
              { action: "keep", regex: "^fdb_.+", sourceLabels: ["__name__"] },
              {
                action: "replace",
                sourceLabels: ["machine_id"],
                targetLabel: "node",
              },
              {
                action: "replace",
                sourceLabels: ["machine_id"],
                regex: "([^\\.]+).*",
                replacement: "$1",
                targetLabel: "short_node",
              },
              {
                action: "replace",
                sourceLabels: ["address"],
                targetLabel: "cluster_ip",
                regex: "([^:]+):.+",
                replacement: "$1",
              },
              {
                action: "replace",
                sourceLabels: ["address"],
                targetLabel: "port",
                regex: "[^:]+:(.+)",
                replacement: "$1",
              },
            ],
            path: "/metrics",
            port: "metrics",
            relabelings: [
              { action: "labeldrop", regex: "^pod$" },
              { replacement: "fdb-exporter", targetLabel: "instance" },
            ],
            scheme: "http",
            scrapeTimeout: "10s",
          },
        ],
        namespaceSelector: {
          matchNames: [namespace],
        },
        selector: {
          matchLabels: service.metadata.labels,
        },
      },
    })
    : undefined;

  return {
    deployment,
    service,
    serviceMonitor,
  };
}
