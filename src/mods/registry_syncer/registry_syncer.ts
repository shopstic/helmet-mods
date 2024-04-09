import type {
  K8s} from "../../deps/helmet.ts";
import {
  createK8sConfigMap,
  createK8sDeployment,
  createK8sVolume,
  createK8sVolumeMount
} from "../../deps/helmet.ts";
import { image as defaultRegistrySyncImage } from "../../apps/registry_syncer/meta.ts";
import type { RegistrySyncJobs, RegistrySyncParams } from "../../apps/registry_syncer/libs/types.ts";

export const defaultName = "registry-syncer";

export function createRegistrySyncerResources({
  name = defaultName,
  image = defaultRegistrySyncImage,
  serviceAccountName,
  digestCheckIntervalSeconds,
  configCheckIntervalSeconds,
  registryAuthOutputSecretName,
  jobs,
  nodeSelector,
  tolerations,
}: {
  name?: string;
  image?: string;
  serviceAccountName?: string;
  registryAuthOutputSecretName: string;
  jobs: RegistrySyncJobs;
  nodeSelector?: Record<string, string>;
  tolerations?: K8s["core.v1.Toleration"][];
} & Omit<RegistrySyncParams, "configFile">) {
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

  const dockerConfigVolume = createK8sVolume({
    name: "docker-config",
    secret: {
      secretName: registryAuthOutputSecretName,
      optional: true,
      items: [
        {
          key: ".dockerconfigjson",
          path: "config.json",
        },
      ],
    },
  });

  const dockerConfigVolumeMount = createK8sVolumeMount({
    name: dockerConfigVolume.name,
    mountPath: "/home/app/.docker",
  });

  const containerParams = {
    configFile: `${jobsConfigVolumeMount.mountPath}/${jobsConfigFileName}`,
    configCheckIntervalSeconds,
    digestCheckIntervalSeconds,
  } satisfies RegistrySyncParams;

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
          nodeSelector,
          tolerations,
          containers: [
            {
              name,
              image,
              args: Object.entries(containerParams).filter(([_, v]) => v !== undefined).map(([k, v]) => `--${k}=${v}`),
              volumeMounts: [
                jobsConfigVolumeMount,
                dockerConfigVolumeMount,
              ],
            },
          ],
          volumes: [
            jobsConfigVolume,
            dockerConfigVolume,
          ],
        },
      },
    },
  });

  return {
    jobsConfigMap,
    deployment,
  };
}

export type RegistrySyncerResources = ReturnType<typeof createRegistrySyncerResources>;
