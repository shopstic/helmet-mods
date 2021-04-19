import {
  createK8sConfigMap,
  createK8sDeployment,
  createK8sSecret,
  createK8sVolume,
  createK8sVolumeMount,
  defineChartInstance,
} from "../../deps/helmet.ts";
import createResourceGroup from "../resource_group/resource_group.ts";
import type {
  VersionBumpParams,
  VersionBumpTargets,
} from "../../apps/iac_version_bumper/libs/types.ts";
import { imageName, version } from "../../apps/iac_version_bumper/meta.ts";

export const defaultName = "iac-version-bumper";
export const defaultImage = `shopstic/${imageName}:${version}`;

export default defineChartInstance(
  (
    {
      name = defaultName,
      namespace = defaultName,
      image = defaultImage,
      gitBranch,
      gitRepoUri,
      checkIntervalSeconds,
      committerName,
      committerEmail,
      sshPrivateKey,
      targets,
    }: {
      name?: string;
      namespace?: string;
      image?: string;
      committerName: string;
      committerEmail: string;
      sshPrivateKey: string;
      targets: VersionBumpTargets;
    } & Omit<VersionBumpParams, "targetsConfigFile">,
  ) => {
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
        [targetsConfigFileName]: JSON.stringify(targets),
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
            containers: [{
              name,
              image,
              args: [
                `--gitRepoUri=${gitRepoUri}`,
                `--gitBranch=${gitBranch}`,
                `--checkIntervalSeconds=${checkIntervalSeconds}`,
                `--targetsConfigFile=${targetsConfigVolumeMount.mountPath}/${targetsConfigFileName}`,
              ],
              volumeMounts: [
                targetsConfigVolumeMount,
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
              sshPrivateKeyVolume,
            ],
          },
        },
      },
    });

    return createResourceGroup({
      name,
      namespace,
      version,
      labels,
      resources: [
        targetsConfigMap,
        sshPrivateKeySecret,
        deployment,
      ],
      crds: [],
    });
  },
);
