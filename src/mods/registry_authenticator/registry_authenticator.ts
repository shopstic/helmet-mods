import type { RegistryAuthConfig, RegistryAuthParams } from "../../apps/registry_authenticator/libs/schemas.ts";
import { image as defaultRegistryAuthImage } from "../../apps/registry_authenticator/meta.ts";
import type { K8s } from "../../deps/helmet.ts";
import {
  createK8sContainer,
  createK8sDeployment,
  createK8sRole,
  createK8sRoleBinding,
  createK8sSecret,
  createK8sVolume,
  createK8sVolumeMount,
} from "../../deps/helmet.ts";
export * from "../../apps/registry_authenticator/libs/schemas.ts";

export const defaultName = "registry-authenticator";

export function createRegistryAuthenticatorResources({
  name,
  namespace,
  serviceAccountName,
  image = defaultRegistryAuthImage,
  config,
  secretMounts,
  configLoadIntervalSeconds = 5,
  outputSecretName,
  nodeSelector,
  tolerations,
}: {
  name: string;
  namespace: string;
  serviceAccountName: string;
  image?: string;
  config: RegistryAuthConfig;
  secretMounts?: Record<string, {
    path: string;
    content: string;
  }>;
  configLoadIntervalSeconds?: number;
  nodeSelector?: Record<string, string>;
  tolerations?: K8s["core.v1.Toleration"][];
} & Pick<RegistryAuthParams, "outputSecretName">) {
  const labels = {
    "app.kubernetes.io/name": defaultName,
    "app.kubernetes.io/instance": name,
  };

  const registryAuthConfigFileName = "registry-auth.json";
  const configSecret = createK8sSecret({
    metadata: {
      name: `${name}-config`,
    },
    data: {
      [registryAuthConfigFileName]: btoa(JSON.stringify(config, null, 2)),
    },
  });

  const configVolume = createK8sVolume({
    name: `registry-auth-config`,
    secret: {
      secretName: configSecret.metadata.name,
    },
  });

  const registryAuthConfigVolumeMount = createK8sVolumeMount({
    name: configVolume.name,
    mountPath: "/home/app/config",
  });

  const secret = createK8sSecret({
    metadata: {
      name,
    },
    data: Object.fromEntries(Object.entries(secretMounts ?? {}).map(([key, { content }]) => [key, btoa(content)])),
  });

  const secretVolume = createK8sVolume({
    name: `${name}-secrets`,
    secret: {
      secretName: secret.metadata.name,
      items: Object.entries(secretMounts ?? {}).map(([key, { path }]) => ({
        key,
        path,
      })),
    },
  });

  const containerParams = {
    configFile: `${registryAuthConfigVolumeMount.mountPath}/${registryAuthConfigFileName}`,
    configLoadIntervalSeconds,
    outputSecretName,
    outputSecretNamespace: namespace,
  } satisfies RegistryAuthParams;

  const container = createK8sContainer({
    name,
    image,
    args: Object.entries(containerParams).filter(([_, v]) => v !== undefined).map(([k, v]) => `--${k}=${v}`),
    volumeMounts: [
      registryAuthConfigVolumeMount,
      ...Object.values(secretMounts ?? {}).map(({ path }) =>
        createK8sVolumeMount({
          name: secretVolume.name,
          mountPath: `/home/app/${path}`,
          subPath: path,
        })
      ),
    ],
  });

  const role = createK8sRole({
    metadata: {
      name,
    },
    rules: [
      {
        apiGroups: [""],
        resources: ["secrets"],
        verbs: ["create"],
      },
      {
        apiGroups: [""],
        resources: ["secrets"],
        verbs: ["get", "watch", "list", "update", "patch"],
        resourceNames: [outputSecretName],
      },
    ],
  });

  const roleBinding = createK8sRoleBinding({
    metadata: {
      name,
    },
    subjects: [
      {
        kind: "ServiceAccount",
        name: serviceAccountName,
        namespace,
      },
    ],
    roleRef: {
      kind: "Role",
      name: role.metadata.name,
      apiGroup: "rbac.authorization.k8s.io",
    },
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
            container,
          ],
          volumes: [
            configVolume,
            secretVolume,
          ],
        },
      },
    },
  });

  return {
    configSecret,
    secret,
    role,
    roleBinding,
    deployment,
  };
}

export type RegistryAuthenticatorResources = ReturnType<typeof createRegistryAuthenticatorResources>;
