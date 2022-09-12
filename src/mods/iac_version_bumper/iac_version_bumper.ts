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
import { IoK8sApiCoreV1PodSpec } from "../../deps/k8s_utils.ts";

export const defaultName = "iac-version-bumper";

export interface IacVersionBumperResources {
  targetsConfigMap: K8sConfigMap;
  registryAuthConfigSecret: K8sSecret;
  registryAuthSecret: K8sSecret;
  sshSecret: K8sSecret;
  deployment: K8sDeployment;
}

export function createIacVersionBumperResources({
  name = defaultName,
  image = defaultIacVersionBumperImage,
  serviceAccountName,
  registryAuthResources,
  gitBranch,
  gitRepoUri,
  checkIntervalSeconds,
  groupingDelaySeconds,
  committerName,
  committerEmail,
  sshPrivateKey,
  targets,
  nodeSelector,
  tolerations,
}: {
  name?: string;
  image?: string;
  serviceAccountName?: string;
  registryAuthResources: RegistryAuthenticatorResources;
  committerName: string;
  committerEmail: string;
  sshPrivateKey: string;
  targets: VersionBumpTargets;
  nodeSelector?: IoK8sApiCoreV1PodSpec["nodeSelector"];
  tolerations?: IoK8sApiCoreV1PodSpec["tolerations"];
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

  const sshSecret = createK8sSecret({
    metadata: {
      name: `${name}-ssh`,
    },
    type: "kubernetes.io/ssh-auth",
    data: {
      "ssh-privatekey": btoa(sshPrivateKey),
      "ssh-config": btoa([
        "Host *",
        "  IdentityFile ~/.ssh/id_rsa",
        "  IdentitiesOnly yes",
        "  StrictHostKeyChecking no",
        "  LogLevel ERROR",
      ].join("\n")),
    },
  });

  const sshPrivateKeyVolume = createK8sVolume({
    name: "ssh-private-key",
    secret: {
      secretName: sshSecret.metadata.name,
      items: [{
        key: "ssh-privatekey",
        path: "id_rsa",
        mode: 256,
      }],
    },
  });

  const sshConfigVolume = createK8sVolume({
    name: "ssh-config",
    secret: {
      secretName: sshSecret.metadata.name,
      items: [{
        key: "ssh-config",
        path: "config",
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
          nodeSelector,
          tolerations,
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
                {
                  name: sshConfigVolume.name,
                  mountPath: "/home/app/.ssh/config",
                  subPath: sshConfigVolume.secret!.items![0].path,
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
            sshConfigVolume,
            registryAuthSecretVolume,
          ],
        },
      },
    },
  });

  return {
    targetsConfigMap,
    registryAuthConfigSecret,
    registryAuthSecret,
    sshSecret,
    deployment,
  };
}
