import { RegistryAuthConfig } from "../../apps/registry_authenticator/libs/types.ts";
import { image as defaultRegistryAuthImage } from "../../apps/registry_authenticator/meta.ts";
import {
  createK8sContainer,
  createK8sSecret,
  createK8sVolume,
  createK8sVolumeMount,
  K8s,
  K8sSecret,
} from "../../deps/helmet.ts";

export interface RegistryAuthenticatorResources {
  registryAuthContainer: K8s["core.v1.Container"];
  registryAuthConfigVolume: K8s["core.v1.Volume"];
  registryAuthConfigSecret: K8sSecret;
  dockerConfigVolume: K8s["core.v1.Volume"];
  dockerConfigVolumeMount: K8s["core.v1.VolumeMount"];
  registryAuthSecret: K8sSecret;
  registryAuthSecretVolume: K8s["core.v1.Volume"];
}

export function createRegistryAuthenticatorResources({
  name,
  image = defaultRegistryAuthImage,
  config,
  configLoadIntervalSeconds = 5,
  secretMounts,
}: {
  name: string;
  image?: string;
  config: RegistryAuthConfig;
  configLoadIntervalSeconds?: number;
  secretMounts?: Record<string, {
    path: string;
    content: string;
  }>;
}): RegistryAuthenticatorResources {
  const registryAuthConfigFileName = "registry-auth.json";
  const registryAuthConfigSecret = createK8sSecret({
    metadata: {
      name: `${name}-config`,
    },
    data: {
      [registryAuthConfigFileName]: btoa(JSON.stringify(config, null, 2)),
    },
  });

  const dockerConfigVolume = createK8sVolume({
    name: "docker-config",
    emptyDir: {},
  });

  const dockerConfigVolumeMount = createK8sVolumeMount({
    name: dockerConfigVolume.name,
    mountPath: "/home/app/.docker",
  });

  const registryAuthConfigVolume = createK8sVolume({
    name: `registry-auth-config`,
    secret: {
      secretName: registryAuthConfigSecret.metadata.name,
    },
  });

  const registryAuthConfigVolumeMount = createK8sVolumeMount({
    name: registryAuthConfigVolume.name,
    mountPath: "/home/app/config",
  });

  const registryAuthSecret = createK8sSecret({
    metadata: {
      name,
    },
    data: Object.fromEntries(Object.entries(secretMounts ?? {}).map(([key, { content }]) => [key, btoa(content)])),
  });

  const registryAuthSecretVolume = createK8sVolume({
    name: `${name}-secrets`,
    secret: {
      secretName: registryAuthSecret.metadata.name,
      items: Object.entries(secretMounts ?? {}).map(([key, { path }]) => ({
        key,
        path,
      })),
    },
  });

  const registryAuthContainer = createK8sContainer({
    name,
    image,
    args: [
      `--configFile=${registryAuthConfigVolumeMount.mountPath}/${registryAuthConfigFileName}`,
      `--configLoadIntervalSeconds=${configLoadIntervalSeconds}`,
      `--outputFile=${dockerConfigVolumeMount.mountPath}/config.json`,
    ],
    volumeMounts: [
      registryAuthConfigVolumeMount,
      dockerConfigVolumeMount,
      ...Object.values(secretMounts ?? {}).map(({ path }) =>
        createK8sVolumeMount({
          name: registryAuthSecretVolume.name,
          mountPath: `/home/app/${path}`,
          subPath: path,
        })
      ),
    ],
  });

  return {
    registryAuthContainer,
    registryAuthConfigVolume,
    registryAuthConfigSecret,
    registryAuthSecret,
    registryAuthSecretVolume,
    dockerConfigVolume,
    dockerConfigVolumeMount: {
      ...dockerConfigVolumeMount,
      readOnly: true,
    },
  };
}
