import {
  createK8sDeployment,
  createK8sService,
  IoK8sApiCoreV1ConfigMapKeySelector,
  K8sResource,
} from "../../../deps/helmet.ts";
import { fdbExporterImage } from "./fdb_images.ts";

export function createFdbExporterResources(
  {
    baseLabels,
    name,
    dedupProxyImage,
    connectionStringConfigMapRef,
    image = fdbExporterImage,
  }: {
    name: string;
    dedupProxyImage: string;
    baseLabels: Record<string, string>;
    connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    image?: string;
  },
): K8sResource[] {
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
          containers: [{
            name: "exporter",
            image,
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
            ],
          }],
        },
      },
    },
  });

  const service = createK8sService({
    metadata: {
      name: name,
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

  return [
    deployment,
    service,
  ];
}
