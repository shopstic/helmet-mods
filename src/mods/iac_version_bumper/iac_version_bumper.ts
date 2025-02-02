import type { K8s } from "$deps/helmet.ts";
import {
  createK8sConfigMap,
  createK8sDeployment,
  createK8sSecret,
  createK8sVolume,
  createK8sVolumeMount,
} from "$deps/helmet.ts";
import type { VersionBumpParams, VersionBumpTargets } from "../../apps/iac_version_bumper/libs/schemas.ts";
import { image as defaultIacVersionBumperImage } from "../../apps/iac_version_bumper/meta.ts";
export * from "../../apps/iac_version_bumper/libs/schemas.ts";

export const defaultName = "iac-version-bumper";

export function createIacVersionBumperResources({
  name = defaultName,
  image = defaultIacVersionBumperImage,
  serviceAccountName,
  registryAuthOutputSecretName,
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
  registryAuthOutputSecretName: string;
  committerName: string;
  committerEmail: string;
  sshPrivateKey: string;
  targets: VersionBumpTargets;
  nodeSelector?: Record<string, string>;
  tolerations?: K8s["core.v1.Toleration"][];
} & Omit<VersionBumpParams, "targetsConfigFile">) {
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
              args: [
                `--git-repo-uri=${gitRepoUri}`,
                `--git-branch=${gitBranch}`,
                `--check-interval-seconds=${checkIntervalSeconds}`,
                `--grouping-delay-seconds=${groupingDelaySeconds}`,
                `--targets-config-file=${targetsConfigVolumeMount.mountPath}/${targetsConfigFileName}`,
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
            dockerConfigVolume,
            sshPrivateKeyVolume,
            sshConfigVolume,
          ],
        },
      },
    },
  });

  return {
    targetsConfigMap,
    sshSecret,
    deployment,
  };
}

export type IacVersionBumperResources = ReturnType<typeof createIacVersionBumperResources>;
