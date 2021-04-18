import {
  createK8sContainer,
  createK8sJob,
  createK8sRole,
  createK8sRoleBinding,
  createK8sServiceAccount,
  IoK8sApiCoreV1ConfigMapKeySelector,
  K8sImagePullPolicy,
  K8sResource,
} from "../../../../deps/helmet.ts";

import { fdbConfiguratorImage, fdbImagePullPolicy } from "../fdb-images.ts";

export function createFdbCreateConnectionStringResources(
  {
    baseLabels,
    baseName,
    namespace,
    connectionStringConfigMapRef,
    coordinatorServiceNames,
    image = fdbConfiguratorImage,
    imagePullPolicy = fdbImagePullPolicy,
  }: {
    baseName: string;
    namespace: string;
    baseLabels: Record<string, string>;
    connectionStringConfigMapRef: IoK8sApiCoreV1ConfigMapKeySelector;
    coordinatorServiceNames: string[];
    image?: string;
    imagePullPolicy?: K8sImagePullPolicy;
  },
): K8sResource[] {
  const resourceName = `${baseName}-create-connection-string`;

  const jobLabels = {
    ...baseLabels,
    "app.kubernetes.io/component": "create-connection-string-job",
  };

  const container = createK8sContainer({
    name: resourceName,
    image,
    imagePullPolicy,
    args: [
      "create-connection-string",
      `--configMapKey=${connectionStringConfigMapRef.key}`,
      `--configMapName=${connectionStringConfigMapRef.name}`,
      ...(coordinatorServiceNames.map((n) => `--serviceNames=${n}`)),
    ],
  });

  const serviceAccount = createK8sServiceAccount({
    metadata: {
      name: resourceName,
    },
  });

  const job = createK8sJob({
    metadata: {
      name: resourceName,
      annotations: {
        "helm.sh/hook": "post-install",
        "helm.sh/hook-weight": "1",
        "helm.sh/hook-delete-policy": "hook-succeeded",
      },
    },
    spec: {
      completions: 1,
      template: {
        metadata: {
          labels: jobLabels,
        },
        spec: {
          serviceAccountName: serviceAccount.metadata.name,
          securityContext: {
            runAsUser: 5000,
            runAsGroup: 5000,
            fsGroup: 5000,
          },
          containers: [container],
          restartPolicy: "OnFailure",
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
      {
        apiGroups: [""],
        resources: ["services"],
        verbs: ["get", "list"],
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

  return [job, serviceAccount, role, roleBinding];
}
