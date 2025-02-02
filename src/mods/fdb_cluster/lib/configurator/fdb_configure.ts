import type {
  K8s,
  K8sConfigMap,
  K8sImagePullPolicy,
  K8sJob,
  K8sRole,
  K8sRoleBinding,
  K8sServiceAccount,
} from "$deps/helmet.ts";
import {
  createK8sConfigMap,
  createK8sContainer,
  createK8sJob,
  createK8sRole,
  createK8sRoleBinding,
  createK8sServiceAccount,
} from "$deps/helmet.ts";

import type { FdbDatabaseConfig } from "../../../../apps/fdb_configurator/libs/types.ts";

export interface FdbConfigureResources {
  job: K8sJob;
  serviceAccount: K8sServiceAccount;
  role: K8sRole;
  roleBinding: K8sRoleBinding;
  databaseConfigMap: K8sConfigMap;
}

export function createFdbConfigureResources(
  {
    baseLabels,
    baseName,
    namespace,
    connectionStringConfigMapRef,
    databaseConfig,
    image,
    imagePullPolicy,
    nodeSelector,
    tolerations,
  }: {
    baseName: string;
    namespace: string;
    baseLabels: Record<string, string>;
    connectionStringConfigMapRef: K8s["core.v1.ConfigMapKeySelector"];
    databaseConfig: FdbDatabaseConfig;
    image: string;
    imagePullPolicy: K8sImagePullPolicy;
    nodeSelector?: Record<string, string>;
    tolerations?: K8s["core.v1.Toleration"][];
  },
): FdbConfigureResources {
  const resourceName = `${baseName}-configure`;

  const jobLabels = {
    ...baseLabels,
    "app.kubernetes.io/component": "configure-job",
  };

  const databaseConfigVolumeName = "database-config";
  const databaseConfigFileName = "database-config.json";
  const databaseConfigFileMountPath = `/home/app/${databaseConfigFileName}`;

  const databaseConfigMap = createK8sConfigMap({
    metadata: {
      name: resourceName,
    },
    data: {
      [databaseConfigFileName]: JSON.stringify(databaseConfig, null, 2),
    },
  });

  const container = createK8sContainer({
    name: resourceName,
    image,
    imagePullPolicy,
    args: [
      "configure",
      `--config-file=${databaseConfigFileMountPath}`,
    ],
    env: [
      {
        name: "FDB_CONNECTION_STRING",
        valueFrom: {
          configMapKeyRef: connectionStringConfigMapRef,
        },
      },
    ],
    volumeMounts: [
      {
        name: databaseConfigVolumeName,
        mountPath: databaseConfigFileMountPath,
        subPath: databaseConfigFileName,
      },
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
        "helm.sh/hook": "post-install,post-upgrade",
        "helm.sh/hook-weight": "2",
        "helm.sh/hook-delete-policy": "before-hook-creation",
      },
    },
    spec: {
      completions: 1,
      template: {
        metadata: {
          labels: jobLabels,
        },
        spec: {
          tolerations,
          nodeSelector,
          serviceAccountName: serviceAccount.metadata.name,
          containers: [container],
          restartPolicy: "OnFailure",
          securityContext: {
            runAsUser: 1001,
            runAsGroup: 1001,
            fsGroup: 1001,
            fsGroupChangePolicy: "OnRootMismatch",
          },
          volumes: [
            {
              name: databaseConfigVolumeName,
              configMap: {
                name: databaseConfigMap.metadata.name,
              },
            },
          ],
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
        resources: ["services"],
        verbs: ["get", "list"],
      },
      {
        apiGroups: [""],
        resources: ["pods"],
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

  return { databaseConfigMap, job, serviceAccount, role, roleBinding };
}
