import {
  createK8sConfigMap,
  createK8sDeployment,
  createK8sSecret,
  createK8sVolume,
  createK8sVolumeMount,
  K8sConfigMap,
  K8sDeployment,
  K8sSecret,
} from "../../deps/helmet.ts";
import type {
  VersionBumpParams,
  VersionBumpTargets,
} from "../../apps/iac_version_bumper/libs/types.ts";
import { imageName, version } from "../../apps/iac_version_bumper/meta.ts";
import { stableHash } from "../../libs/hash_utils.ts";

export const defaultName = "iac-version-bumper";
export const defaultImage = `shopstic/${imageName}${
  version === "latest" ? ":latest" : `@${version}`
}`;

export interface IacVersionBumperResources {
  targetsConfigMap: K8sConfigMap;
  dockerConfigSecret: K8sSecret;
  sshPrivateKeySecret: K8sSecret;
  deployment: K8sDeployment;
}

export function createIacVersionBumperResources({
  name = defaultName,
  image = defaultImage,
  gitBranch,
  gitRepoUri,
  checkIntervalSeconds,
  groupingDelaySeconds,
  committerName,
  committerEmail,
  sshPrivateKey,
  targets,
  dockerConfig = {
    auths: {},
  },
}: {
  name?: string;
  image?: string;
  committerName: string;
  committerEmail: string;
  sshPrivateKey: string;
  targets: VersionBumpTargets;
  dockerConfig?: {
    auths: Record<string, unknown>;
    [k: string]: unknown;
  };
} & Omit<VersionBumpParams, "targetsConfigFile">): IacVersionBumperResources {
  const labels = {
    "app.kubernetes.io/name": defaultName,
    "app.kubernetes.io/instance": name,
  };

  const targetsConfigFileName = "targets.json";
  const targetsConfigMap = createK8sConfigMap({
    metadata: {
      name: `${name}-targets`,
    },
    data: {
      [targetsConfigFileName]: JSON.stringify(targets, null, 2),
    },
  });

  const dockerConfigSecret = createK8sSecret({
    metadata: {
      name: `${name}-docker-config`,
    },
    data: {
      "config.json": btoa(JSON.stringify(dockerConfig, null, 2)),
    },
  });

  const sshPrivateKeySecret = createK8sSecret({
    metadata: {
      name: `${name}-ssh-private-key`,
    },
    type: "kubernetes.io/ssh-auth",
    data: {
      "ssh-privatekey": btoa(sshPrivateKey),
    },
  });

  const sshPrivateKeyVolume = createK8sVolume({
    name: "ssh-private-key",
    secret: {
      secretName: sshPrivateKeySecret.metadata.name,
      items: [{
        key: "ssh-privatekey",
        path: "id_rsa",
        mode: 256,
      }],
    },
  });

  const dockerConfigVolume = createK8sVolume({
    name: `docker-config-${stableHash(targetsConfigMap)}`,
    secret: {
      secretName: dockerConfigSecret.metadata.name,
    },
  });

  const dockerConfigVolumeMount = createK8sVolumeMount({
    name: dockerConfigVolume.name,
    mountPath: "/home/app/.docker",
  });

  const targetsConfigVolume = createK8sVolume({
    name: `targets-config-${stableHash(targetsConfigMap)}`,
    configMap: {
      name: targetsConfigMap.metadata.name,
    },
  });

  const targetsConfigVolumeMount = createK8sVolumeMount({
    name: targetsConfigVolume.name,
    mountPath: "/app/config",
  });

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
          securityContext: {
            runAsUser: 5000,
            runAsGroup: 5000,
            fsGroup: 5000,
            fsGroupChangePolicy: "OnRootMismatch",
          },
          containers: [{
            name,
            image,
            args: [
              `--gitRepoUri=${gitRepoUri}`,
              `--gitBranch=${gitBranch}`,
              `--checkIntervalSeconds=${checkIntervalSeconds}`,
              `--groupingDelaySeconds=${groupingDelaySeconds}`,
              `--targetsConfigFile=${targetsConfigVolumeMount.mountPath}/${targetsConfigFileName}`,
            ],
            volumeMounts: [
              targetsConfigVolumeMount,
              dockerConfigVolumeMount,
              {
                name: sshPrivateKeyVolume.name,
                mountPath: "/home/app/.ssh/id_rsa",
                subPath: sshPrivateKeyVolume.secret!.items![0].path,
              },
            ],
            env: [{
              name: "COMMITTER_NAME",
              value: committerName,
            }, {
              name: "COMMITTER_EMAIL",
              value: committerEmail,
            }],
          }],
          volumes: [
            targetsConfigVolume,
            dockerConfigVolume,
            sshPrivateKeyVolume,
          ],
        },
      },
    },
  });

  return {
    targetsConfigMap,
    dockerConfigSecret,
    sshPrivateKeySecret,
    deployment,
  };
}
