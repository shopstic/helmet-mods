import {
  createK8sContainer,
  createK8sDeployment,
  createK8sRole,
  createK8sRoleBinding,
  createK8sServiceAccount,
  IoK8sApiCoreV1ConfigMapKeySelector,
  K8sDeployment,
  K8sImagePullPolicy,
  K8sRole,
  K8sRoleBinding,
  K8sServiceAccount,
} from "../../../../deps/helmet.ts";

export interface FdbSyncConnectionStringResources {
  deployment: K8sDeployment;
  serviceAccount: K8sServiceAccount;
  role: K8sRole;
  roleBinding: K8sRoleBinding;
}

export function createFdbSyncConnectionStringResources({
  baseLabels,
  releaseName,
  namespace,
  connectionStringConfigMapRef,
  image,
  imagePullPolicy,
}: {
  releaseName: string;
  namespace: string;
  baseLabels: Record<string, string>;
  connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
  image: string;
  imagePullPolicy: K8sImagePullPolicy;
}): FdbSyncConnectionStringResources {
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
            runAsUser: 1001,
            runAsGroup: 1001,
            fsGroup: 1001,
            fsGroupChangePolicy: "OnRootMismatch",
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

  return { deployment, serviceAccount, role, roleBinding };
}
