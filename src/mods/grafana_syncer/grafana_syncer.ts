import {
  createK8sDeployment,
  createK8sRole,
  createK8sRoleBinding,
  createK8sServiceAccount,
  K8s,
  K8sCrd,
  K8sDeployment,
  K8sRole,
  K8sRoleBinding,
  K8sServiceAccount,
} from "../../deps/helmet.ts";
import { image as defaultGrafanaSyncerImage } from "../../apps/grafana_syncer/meta.ts";
import crd from "./crd.ts";
import { GrafanaSyncerParams } from "../../apps/grafana_syncer/libs/types.ts";

export const defaultName = "grafana-syncer";

export interface GrafanaSyncerResources {
  crd: K8sCrd;
  serviceAccount: K8sServiceAccount;
  role: K8sRole;
  roleBinding: K8sRoleBinding;
  deployment: K8sDeployment;
}

interface K8sSelector {
  key: string;
  operator: "=" | "==" | "!=";
  value: string;
}

function selectorToString({ key, operator, value }: K8sSelector): string {
  return `${key}${operator}${value}`;
}

function selectorsToString(selectors: K8sSelector[]): string | undefined {
  return selectors.length > 0 ? selectors.map(selectorToString).join(",") : undefined;
}

export function createGrafanaSyncerResources({
  name = defaultName,
  image = defaultGrafanaSyncerImage,
  namespace,
  grafanaApiServerBaseUrl,
  grafanaBearerTokenSecretRef,
  labelSelector = [],
  fieldSelector = [],
}: {
  name?: string;
  image?: string;
  namespace: string;
  grafanaApiServerBaseUrl: string;
  grafanaBearerTokenSecretRef: K8s["core.v1.SecretKeySelector"];
  labelSelector?: K8sSelector[];
  fieldSelector?: K8sSelector[];
}): GrafanaSyncerResources {
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
        verbs: ["list", "watch", "patch"],
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

  const args: Omit<GrafanaSyncerParams, "grafanaBearerToken"> = {
    grafanaApiServerBaseUrl,
    labelSelector: selectorsToString(labelSelector),
    fieldSelector: selectorsToString(fieldSelector),
    k8sApiServerBaseUrl: "http://localhost:8001",
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
                "public.ecr.aws/shopstic/kubectl:1.25.4@sha256:d565e499a017c29a663c99254927254ba1ab553ec78110d8cbd46c25e5df3b3b",
              command: ["/bin/kubectl", "proxy"],
            },
            {
              name,
              image,
              env: [{
                name: "GRAFANA_BEARER_TOKEN",
                valueFrom: {
                  secretKeyRef: grafanaBearerTokenSecretRef,
                },
              }],
              args: Object
                .entries(args)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => `--${k}=${v}`)
                .concat(
                  "--grafanaBearerToken=$(GRAFANA_BEARER_TOKEN)",
                ),
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
