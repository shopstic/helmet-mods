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
import type { VersionBumpParams, VersionBumpTargets } from "../../apps/iac_version_bumper/libs/types.ts";
import { image as defaultIacVersionBumperImage } from "../../apps/iac_version_bumper/meta.ts";
import { RegistryAuthenticatorResources } from "../registry_authenticator/registry_authenticator.ts";

export const defaultName = "iac-version-bumper";

export interface IacVersionBumperResources {
  targetsConfigMap: K8sConfigMap;
  registryAuthConfigSecret: K8sSecret;
  sshPrivateKeySecret: K8sSecret;
  deployment: K8sDeployment;
}

export function createIacVersionBumperResources({
  name = defaultName,
  image = defaultIacVersionBumperImage,
  registryAuthResources,
  gitBranch,
  gitRepoUri,
  checkIntervalSeconds,
  groupingDelaySeconds,
  committerName,
  committerEmail,
  sshPrivateKey,
  targets,
}: {
  name?: string;
  image?: string;
  registryAuthResources: RegistryAuthenticatorResources;
  committerName: string;
  committerEmail: string;
  sshPrivateKey: string;
  targets: VersionBumpTargets;
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

  const targetsConfigVolume = createK8sVolume({
    name: "targets-config",
    configMap: {
      name: targetsConfigMap.metadata.name,
    },
  });

  const targetsConfigVolumeMount = createK8sVolumeMount({
    name: targetsConfigVolume.name,
    mountPath: "/home/app/config",
  });

  const {
    registryAuthContainer,
    registryAuthConfigVolume,
    registryAuthConfigSecret,
    dockerConfigVolume,
    dockerConfigVolumeMount,
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
            },
          ],
          volumes: [
            targetsConfigVolume,
            registryAuthConfigVolume,
            dockerConfigVolume,
            sshPrivateKeyVolume,
          ],
        },
      },
    },
  });

  return {
    targetsConfigMap,
    registryAuthConfigSecret,
    sshPrivateKeySecret,
    deployment,
  };
}
