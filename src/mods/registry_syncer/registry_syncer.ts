import {
  createK8sConfigMap,
  createK8sDeployment,
  createK8sVolume,
  createK8sVolumeMount,
  K8sConfigMap,
  K8sDeployment,
  K8sSecret,
} from "../../deps/helmet.ts";
import { image as defaultRegistrySyncImage } from "../../apps/registry_syncer/meta.ts";
import { RegistrySyncJobs, RegistrySyncParams } from "../../apps/registry_syncer/libs/types.ts";
import { RegistryAuthenticatorResources } from "../registry_authenticator/registry_authenticator.ts";

export const defaultName = "iac-version-bumper";

export interface RegistrySyncerResources {
  jobsConfigMap: K8sConfigMap;
  registryAuthConfigSecret: K8sSecret;
  registryAuthSecret: K8sSecret;
  deployment: K8sDeployment;
}

export function createRegistrySyncerResources({
  name = defaultName,
  image = defaultRegistrySyncImage,
  serviceAccountName,
  registryAuthResources,
  digestCheckIntervalSeconds,
  configCheckIntervalSeconds,
  jobs,
}: {
  name?: string;
  image?: string;
  serviceAccountName?: string;
  registryAuthResources: RegistryAuthenticatorResources;
  jobs: RegistrySyncJobs;
} & Omit<RegistrySyncParams, "configFile">): RegistrySyncerResources {
  const labels = {
    "app.kubernetes.io/name": defaultName,
    "app.kubernetes.io/instance": name,
  };

  const jobsConfigFileName = "targets.json";
  const jobsConfigMap = createK8sConfigMap({
    metadata: {
      name: `${name}-jobs`,
    },
    data: {
      [jobsConfigFileName]: JSON.stringify(jobs, null, 2),
    },
  });

  const jobsConfigVolume = createK8sVolume({
    name: "targets-config",
    configMap: {
      name: jobsConfigMap.metadata.name,
    },
  });

  const jobsConfigVolumeMount = createK8sVolumeMount({
    name: jobsConfigVolume.name,
    mountPath: "/home/app/config",
  });

  const {
    registryAuthContainer,
    registryAuthConfigVolume,
    registryAuthConfigSecret,
    dockerConfigVolume,
    dockerConfigVolumeMount,
    registryAuthSecret,
    registryAuthSecretVolume,
  } = registryAuthResources;

  const deployment = createK8sDeployment({
    metadata: {
      name,
    },
    spec: {
      selector: {
        matchLabels: labels,
      },
      strategy: {
        type: "Recreate",
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          serviceAccountName,
          securityContext: {
            runAsUser: 1001,
            runAsGroup: 1001,
            fsGroup: 1001,
            fsGroupChangePolicy: "OnRootMismatch",
          },
          containers: [
            registryAuthContainer,
            {
              name,
              image,
              args: [
                `--configCheckIntervalSeconds=${configCheckIntervalSeconds}`,
                `--digestCheckIntervalSeconds=${digestCheckIntervalSeconds}`,
                `--configFile=${jobsConfigVolumeMount.mountPath}/${jobsConfigFileName}`,
              ],
              volumeMounts: [
                jobsConfigVolumeMount,
                dockerConfigVolumeMount,
              ],
            },
          ],
          volumes: [
            jobsConfigVolume,
            registryAuthConfigVolume,
            dockerConfigVolume,
            registryAuthSecretVolume,
          ],
        },
      },
    },
  });

  return {
    jobsConfigMap,
    registryAuthConfigSecret,
    registryAuthSecret,
    deployment,
  };
}
