import type {
  K8s,
  K8sClusterRole,
  K8sClusterRoleBinding,
  K8sDaemonSet,
  K8sImagePullPolicy,
  K8sServiceAccount,
} from "$deps/helmet.ts";
import {
  createK8sClusterRole,
  createK8sClusterRoleBinding,
  createK8sContainer,
  createK8sDaemonSet,
  createK8sServiceAccount,
} from "$deps/helmet.ts";

export const PENDING_LABEL_VALUE_YES = "yes";
export const PENDING_LABEL_VALUE_NO = "no";

export function createPendingLabelName(releaseName: string) {
  return `helmet.run/${releaseName}-local-pv-pending`;
}

export function createPendingDeviceIdsAnnotationName(releaseName: string) {
  return `helmet.run/${releaseName}-local-pv-device-ids`;
}

export interface FdbPrepareLocalPvResources {
  daemonSet: K8sDaemonSet;
  serviceAccount: K8sServiceAccount;
  clusterRole: K8sClusterRole;
  clusterRoleBinding: K8sClusterRoleBinding;
}

export function createFdbPrepareLocalPvResources({
  baseLabels,
  baseName,
  namespace,
  image,
  imagePullPolicy,
  rootMountPath = "/mnt/fdb",
  nodeSelector,
  tolerations,
}: {
  baseName: string;
  namespace: string;
  baseLabels: Record<string, string>;
  image: string;
  imagePullPolicy: K8sImagePullPolicy;
  rootMountPath?: string;
  nodeSelector?: Record<string, string>;
  tolerations?: K8s["core.v1.Toleration"][];
}): FdbPrepareLocalPvResources {
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
      `--node-name-env-var-name=${nodeNameEnvVarName}`,
      `--pending-label-name=${pendingLabelName}`,
      `--pending-label-completed-value=${PENDING_LABEL_VALUE_NO}`,
      `--pending-device-ids-annotation-name=${pendingDeviceIdsAnnotationName}`,
      `--root-mount-path=${rootMountPath}`,
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
            ...(nodeSelector ?? {}),
            [pendingLabelName]: PENDING_LABEL_VALUE_YES,
          },
          tolerations,
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

  return { daemonSet, serviceAccount, clusterRole, clusterRoleBinding };
}
