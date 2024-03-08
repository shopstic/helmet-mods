import {
  createK8sDeployment,
  createK8sRole,
  createK8sRoleBinding,
  createK8sServiceAccount,
  K8sCrd,
  K8sDeployment,
  K8sRole,
  K8sRoleBinding,
  K8sServiceAccount,
} from "../../deps/helmet.ts";
import { image as defaultK8sJobAutoscalerImage } from "../../apps/k8s_job_autoscaler/meta.ts";
import crd from "./crd.json" with { type: "json" };
import { K8sJobAutoscalerParams } from "../../apps/k8s_job_autoscaler/libs/types.ts";

export const defaultName = "k8s-job-autoscaler";

export interface K8sJobAutoscalerResources {
  crd: K8sCrd;
  serviceAccount: K8sServiceAccount;
  role: K8sRole;
  roleBinding: K8sRoleBinding;
  deployment: K8sDeployment;
}

export function createK8sJobAutoscalerResources({
  name = defaultName,
  image = defaultK8sJobAutoscalerImage,
  namespace,
  minReconcileIntervalMs,
}: {
  name?: string;
  image?: string;
  namespace: string;
  minReconcileIntervalMs: number;
}): K8sJobAutoscalerResources {
  const labels = {
    "app.kubernetes.io/name": defaultName,
    "app.kubernetes.io/instance": name,
  };

  const serviceAccount = createK8sServiceAccount({
    metadata: {
      name,
      namespace,
    },
  });

  const role = createK8sRole({
    metadata: {
      name,
      namespace,
    },
    rules: [
      {
        apiGroups: [crd.spec.group],
        resources: [crd.spec.names.plural],
        verbs: ["get", "list", "watch"],
      },
      {
        apiGroups: ["batch"],
        resources: ["jobs"],
        verbs: ["get", "list", "watch", "create", "update", "patch", "delete"],
      },
    ],
  });

  const roleBinding = createK8sRoleBinding({
    metadata: {
      name,
      namespace,
    },
    subjects: [
      {
        kind: "ServiceAccount",
        name,
        namespace,
      },
    ],
    roleRef: {
      kind: "Role",
      name,
      apiGroup: "rbac.authorization.k8s.io",
    },
  });

  const args: K8sJobAutoscalerParams = {
    minReconcileIntervalMs,
    apiServerBaseUrl: "http://localhost:8001",
  };

  const deployment = createK8sDeployment({
    metadata: {
      name,
      namespace,
    },
    spec: {
      selector: {
        matchLabels: labels,
      },
      replicas: 1,
      strategy: {
        type: "Recreate",
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          serviceAccountName: serviceAccount.metadata.name,
          securityContext: {
            runAsUser: 1001,
            runAsGroup: 1001,
          },
          containers: [
            {
              name: "kubectl-proxy",
              image:
                "public.ecr.aws/shopstic/bin-kubectl:1.23.5@sha256:f0226b79af58eb2c091f995c57ee2d929608d127b72b76294fcbdb5912aa2fa3",
              command: ["/bin/kubectl", "proxy"],
            },
            {
              name,
              image,
              args: Object.entries(args).map(([k, v]) => `--${k}=${v}`),
            },
          ],
        },
      },
    },
  });

  return {
    crd: crd as K8sCrd,
    serviceAccount,
    role,
    roleBinding,
    deployment,
  };
}
