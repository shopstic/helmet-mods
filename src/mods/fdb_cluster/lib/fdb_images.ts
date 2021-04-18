import { K8sImagePullPolicy } from "../../../deps/helmet.ts";

export const fdbVersion = "6.2.30";
export const fdbConfiguratorVersion = "1.2.2";
export const fdbExporterVersion = "1.1.0";

export const fdbImage = `shopstic/fdb:${fdbVersion}`;
export const fdbToolsImage = `shopstic/fdb-tools:${fdbVersion}`;
export const fdbConfiguratorImage =
  `shopstic/k8s-fdb-configurator:${fdbConfiguratorVersion}`;
export const fdbExporterImage =
  `shopstic/fdb-prometheus-exporter:${fdbExporterVersion}`;

export const fdbImagePullPolicy: K8sImagePullPolicy = "IfNotPresent";
