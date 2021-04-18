import {
  createK8sClusterRole,
  createK8sClusterRoleBinding,
  createK8sContainer,
  createK8sDaemonSet,
  createK8sServiceAccount,
  K8sImagePullPolicy,
  K8sResource,
} from "../../../../deps/helmet.ts";

import { fdbConfiguratorImage, fdbImagePullPolicy } from "../fdb-images.ts";

export const PENDING_LABEL_VALUE_YES = "yes";
export const PENDING_LABEL_VALUE_NO = "no";
export const ROOT_MOUNT_PATH = "/mnt/fdb";

export function createPendingLabelName(releaseName: string) {
  return `shopstic.com/${releaseName}-local-pv-pending`;
}

export function createPendingDeviceIdsAnnotationName(releaseName: string) {
  return `shopstic.com/${releaseName}-local-pv-device-ids`;
}

export function createFdbPrepareLocalPvResources({
  baseLabels,
  baseName,
  namespace,
  image = fdbConfiguratorImage,
  imagePullPolicy = fdbImagePullPolicy,
}: {
  baseName: string;
  namespace: string;
  baseLabels: Record<string, string>;
  image?: string;
  imagePullPolicy?: K8sImagePullPolicy;
}): K8sResource[] {
  const component = "prepare-local-pv";
  const resourceName = `${baseName}-${component}`;

  const labels = {
    ...baseLabels,
    "app.kubernetes.io/component": component,
  };

  const nodeNameEnvVarName = "K8S_NODE_NAME";
  const pendingLabelName = createPendingLabelName(baseName);
  const pendingDeviceIdsAnnotationName = createPendingDeviceIdsAnnotationName(
    baseName,
  );

  const container = createK8sContainer({
    name: resourceName,
    image,
    imagePullPolicy,
    securityContext: {
      privileged: true,
    },
    args: [
      "prepare-local-pv",
      `--nodeNameEnvVarName=${nodeNameEnvVarName}`,
      `--pendingLabelName=${pendingLabelName}`,
      `--pendingLabelCompletedValue=${PENDING_LABEL_VALUE_NO}`,
      `--pendingDeviceIdsAnnotationName=${pendingDeviceIdsAnnotationName}`,
      `--rootMountPath=${ROOT_MOUNT_PATH}`,
    ],
    env: [
      {
        name: "OPTIC_MIN_LEVEL",
        value: "Info",
      },
      {
        name: nodeNameEnvVarName,
        valueFrom: {
          fieldRef: {
            fieldPath: "spec.nodeName",
          },
        },
      },
    ],
  });

  const serviceAccount = createK8sServiceAccount({
    metadata: {
      name: resourceName,
    },
  });

  const daemonSet = createK8sDaemonSet({
    metadata: {
      name: resourceName,
      labels,
    },
    spec: {
      selector: {
        matchLabels: labels,
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          serviceAccountName: serviceAccount.metadata.name,
          hostPID: true,
          containers: [container],
          securityContext: {
            runAsUser: 0,
            runAsGroup: 0,
          },
          nodeSelector: {
            [pendingLabelName]: PENDING_LABEL_VALUE_YES,
          },
        },
      },
    },
  });

  const clusterRole = createK8sClusterRole({
    metadata: {
      name: resourceName,
    },
    rules: [
      {
        apiGroups: [""],
        resources: ["nodes"],
        verbs: ["get", "list", "patch"],
      },
    ],
  });

  const clusterRoleBinding = createK8sClusterRoleBinding({
    metadata: {
      name: resourceName,
    },
    subjects: [
      {
        kind: serviceAccount.kind,
        name: resourceName,
        namespace,
      },
    ],
    roleRef: {
      kind: clusterRole.kind,
      name: resourceName,
      apiGroup: "rbac.authorization.k8s.io",
    },
  });

  return [daemonSet, serviceAccount, clusterRole, clusterRoleBinding];
}
