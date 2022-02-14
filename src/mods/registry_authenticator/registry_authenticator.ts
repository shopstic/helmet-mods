import { RegistryAuthConfig } from "../../apps/registry_authenticator/libs/types.ts";
import { image as defaultRegistryAuthImage } from "../../apps/registry_authenticator/meta.ts";
import {
  createK8sContainer,
  createK8sSecret,
  createK8sVolume,
  createK8sVolumeMount,
  IoK8sApiCoreV1Container,
  IoK8sApiCoreV1Volume,
  IoK8sApiCoreV1VolumeMount,
  K8sSecret,
} from "../../deps/helmet.ts";

export interface RegistryAuthenticatorResources {
  registryAuthContainer: IoK8sApiCoreV1Container;
  registryAuthConfigVolume: IoK8sApiCoreV1Volume;
  registryAuthConfigSecret: K8sSecret;
  dockerConfigVolume: IoK8sApiCoreV1Volume;
  dockerConfigVolumeMount: IoK8sApiCoreV1VolumeMount;
}

export function createRegistryAuthenticatorResources({
  name,
  image = defaultRegistryAuthImage,
  config,
  configLoadIntervalSeconds = 5,
}: {
  name: string;
  image?: string;
  config: RegistryAuthConfig;
  configLoadIntervalSeconds?: number;
}): RegistryAuthenticatorResources {
  const registryAuthConfigFileName = "registry-auth.json";
  const registryAuthConfigSecret = createK8sSecret({
    metadata: {
      name: `${name}-registry-auth-config`,
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

  const registryAuthContainer = createK8sContainer({
    name: `${name}-registry-authenticator`,
    image,
    args: [
      `--configFile=${registryAuthConfigVolumeMount.mountPath}/${registryAuthConfigFileName}`,
      `--configLoadIntervalSeconds=${configLoadIntervalSeconds}`,
      `--outputFile=${dockerConfigVolumeMount.mountPath}/config.json`,
    ],
    volumeMounts: [
      registryAuthConfigVolumeMount,
      dockerConfigVolumeMount,
    ],
  });

  return {
    registryAuthContainer,
    registryAuthConfigVolume,
    registryAuthConfigSecret,
    dockerConfigVolume,
    dockerConfigVolumeMount: {
      ...dockerConfigVolumeMount,
      readOnly: true,
    },
  };
}
