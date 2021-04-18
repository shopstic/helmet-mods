import {
  createK8sContainer,
  createK8sDeployment,
  createK8sRole,
  createK8sRoleBinding,
  createK8sServiceAccount,
  IoK8sApiCoreV1ConfigMapKeySelector,
  K8sImagePullPolicy,
  K8sResource,
} from "../../../../deps/helmet.ts";

import { fdbConfiguratorImage, fdbImagePullPolicy } from "../fdb-images.ts";

export function createFdbSyncConnectionStringResources({
  baseLabels,
  releaseName,
  namespace,
  connectionStringConfigMapRef,
  image = fdbConfiguratorImage,
  imagePullPolicy = fdbImagePullPolicy,
}: {
  releaseName: string;
  namespace: string;
  baseLabels: Record<string, string>;
  connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
  image?: string;
  imagePullPolicy?: K8sImagePullPolicy;
}): K8sResource[] {
  const resourceName = `${releaseName}-sync-connection-string`;

  const labels = {
    ...baseLabels,
    "app.kubernetes.io/component": "sync-connection-string",
  };

  const container = createK8sContainer({
    name: resourceName,
    image,
    imagePullPolicy,
    args: [
      "sync-connection-string",
      `--configMapKey=${connectionStringConfigMapRef.key}`,
      `--configMapName=${connectionStringConfigMapRef.name}`,
      `--updateIntervalMs=1000`,
    ],
    env: [
      {
        name: "OPTIC_MIN_LEVEL",
        value: "Info",
      },
      {
        name: "FDB_CONNECTION_STRING",
        valueFrom: {
          configMapKeyRef: connectionStringConfigMapRef,
        },
      },
    ],
  });

  const serviceAccount = createK8sServiceAccount({
    metadata: {
      name: resourceName,
    },
  });

  const deployment = createK8sDeployment({
    metadata: {
      name: resourceName,
      labels,
    },
    spec: {
      replicas: 1,
      strategy: {
        type: "Recreate",
      },
      selector: {
        matchLabels: labels,
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          serviceAccountName: serviceAccount.metadata.name,
          containers: [container],
          securityContext: {
            runAsUser: 5000,
            runAsGroup: 5000,
            fsGroup: 5000,
          },
        },
      },
    },
  });

  const role = createK8sRole({
    metadata: {
      name: resourceName,
    },
    rules: [
      {
        apiGroups: [""],
        resources: ["configmaps"],
        verbs: ["create", "get", "watch", "list", "update", "patch"],
      },
    ],
  });

  const roleBinding = createK8sRoleBinding({
    metadata: {
      name: resourceName,
    },
    subjects: [
      {
        kind: "ServiceAccount",
        name: resourceName,
        namespace,
      },
    ],
    roleRef: {
      kind: "Role",
      name: resourceName,
      apiGroup: "rbac.authorization.k8s.io",
    },
  });

  return [deployment, serviceAccount, role, roleBinding];
}
