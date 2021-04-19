import { K8sImagePullPolicy } from "../../../deps/helmet.ts";
import {
  imageName as fdbImageName,
  version as fdbVersion,
} from "../../../apps/fdb/meta.ts";
import {
  imageName as fdbConfiguratorImageName,
  version as fdbConfiguratorVersion,
} from "../../../apps/fdb_configurator/meta.ts";

export { fdbConfiguratorVersion, fdbVersion };

export const fdbExporterVersion = "1.1.0";

export const fdbImage = `shopstic/${fdbImageName}:${fdbVersion}`;
export const fdbToolsImage = `shopstic/fdb-tools:${fdbVersion}`;
export const fdbConfiguratorImage =
  `shopstic/${fdbConfiguratorImageName}:${fdbConfiguratorVersion}`;
export const fdbExporterImage =
  `shopstic/fdb-prometheus-exporter:${fdbExporterVersion}`;

export const fdbImagePullPolicy: K8sImagePullPolicy = "IfNotPresent";
