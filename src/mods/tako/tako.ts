import type {
  K8s,
  K8sClusterRole,
  K8sClusterRoleBinding,
  K8sRole,
  K8sRoleBinding,
  K8sSecret,
  K8sServiceAccount,
  K8sStatefulSet,
} from "@wok/helmet";
import {
  createK8sClusterRole,
  createK8sClusterRoleBinding,
  createK8sRole,
  createK8sRoleBinding,
  createK8sSecret,
  createK8sServiceAccount,
  createK8sStatefulSet,
  createK8sVolume,
  createK8sVolumeMount,
} from "@wok/helmet";
import { image as defaultImage } from "$apps/tako/meta.ts";
import { takoWarmEc2NodeCrd } from "$apps/tako/crd.ts";
import type { TakoRunParams } from "$apps/tako/run.ts";
import type { OmitDeep } from "type-fest";
import { stableDigest } from "@wok/utils/stable-digest";
import { stripMargin } from "@wok/utils/strip-margin";
export * from "$apps/tako/crd.ts";

const defaultName = "tako";

type TakoConfig = OmitDeep<
  typeof TakoRunParams.inferInput,
  "lease" | "ec2.sshPrivateKeyPath" | "ec2.cloudInitScriptPath"
>;

export interface TakoResources {
  crd: typeof takoWarmEc2NodeCrd;
  statefulSet: K8sStatefulSet;
  serviceAccount: K8sServiceAccount;
  clusterRole: K8sClusterRole;
  clusterRoleBinding: K8sClusterRoleBinding;
  secret: K8sSecret;
  systemRole: K8sRole;
  systemRoleBinding: K8sRoleBinding;
  role: K8sRole;
  roleBinding: K8sRoleBinding;
}

export async function createTakoResources(
  {
    name = defaultName,
    image = defaultImage,
    replicas = 2,
    sshPrivateKey,
    namespace,
    tolerations,
    nodeSelector,
    resourceRequirements,
    affinity,
    topologySpreadConstraints,
    args,
    awsAuthSecretName,
    extraEnv = [],
  }: {
    name?: string;
    image?: string;
    replicas?: number;
    sshPrivateKey: string;
    args: TakoConfig;
    namespace: string;
    nodeSelector?: Record<string, string>;
    tolerations?: K8s["core.v1.Toleration"][];
    resourceRequirements?: K8s["core.v1.ResourceRequirements"];
    affinity?: K8s["core.v1.Affinity"];
    topologySpreadConstraints?: K8s["core.v1.TopologySpreadConstraint"][];
    extraEnv?: K8s["core.v1.EnvVar"][];
    awsAuthSecretName: string;
  },
): Promise<TakoResources> {
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

  const clusterRole = createK8sClusterRole({
    metadata: {
      name,
    },
    rules: [
      {
        apiGroups: [takoWarmEc2NodeCrd.spec.group],
        resources: [takoWarmEc2NodeCrd.spec.names.plural],
        verbs: ["get", "list", "watch", "patch"],
      },
      {
        apiGroups: [""],
        resources: ["pods"],
        verbs: ["get", "list", "watch"],
      },
      {
        apiGroups: [""],
        resources: ["nodes"],
        verbs: ["get", "list", "watch", "delete"],
      },
    ],
  });

  const role = createK8sRole({
    metadata: {
      name,
      namespace,
    },
    rules: [
      {
        apiGroups: ["coordination.k8s.io"],
        resources: ["leases"],
        verbs: ["create", "get", "patch", "update", "list", "watch"],
      },
    ],
  });

  const roleBinding = createK8sRoleBinding({
    metadata: {
      name,
      namespace,
    },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: role.kind,
      name: role.metadata.name,
    },
    subjects: [
      {
        kind: serviceAccount.kind,
        name: serviceAccount.metadata.name,
        namespace: serviceAccount.metadata.namespace,
      },
    ],
  });

  const systemRole = createK8sRole({
    metadata: {
      name,
      namespace: "kube-system",
    },
    rules: [
      {
        apiGroups: [""],
        resources: ["secrets"],
        verbs: ["create"],
      },
    ],
  });

  const systemRoleBinding = createK8sRoleBinding({
    metadata: {
      name,
      namespace: "kube-system",
    },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: systemRole.kind,
      name: systemRole.metadata.name,
    },
    subjects: [
      {
        kind: serviceAccount.kind,
        name: serviceAccount.metadata.name,
        namespace: serviceAccount.metadata.namespace,
      },
    ],
  });

  const clusterRoleBinding = createK8sClusterRoleBinding({
    metadata: {
      name,
    },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: clusterRole.kind,
      name: clusterRole.metadata.name,
    },
    subjects: [
      {
        kind: serviceAccount.kind,
        name: serviceAccount.metadata.name,
        namespace: serviceAccount.metadata.namespace,
      },
    ],
  });

  const homePath = "/home/tako";
  const sshPrivateKeyPath = `${homePath}/.ssh/id`;
  const cloudInitScriptPath = `${homePath}/cloud_init.sh`;
  const leaseIdentityFilePath = `${homePath}/lease`;
  const leaseDurationsSeconds = 30;
  const leaseRenewIntervalSeconds = 5;
  const leaseRenewalMaxAllowedLagSeconds = 15;
  const terminationGracePeriodSeconds = 5;
  const livenessProbePeriodSeconds = 2;

  const mergedArgs = {
    ...args,
    lease: {
      name,
      namespace,
      identityFile: leaseIdentityFilePath,
      durationSeconds: leaseDurationsSeconds,
      renewIntervalSeconds: leaseRenewIntervalSeconds,
    },
    ec2: {
      ...args.ec2,
      cloudInitScriptPath,
      sshPrivateKeyPath,
    },
  } satisfies OmitDeep<typeof TakoRunParams.inferInput, "lease.identity">;

  const secretData = {
    "args.json": btoa(JSON.stringify(mergedArgs, null, 2)),
    "ssh_id": btoa(sshPrivateKey),
  } as const;

  const secret = createK8sSecret({
    metadata: {
      name,
      namespace,
    },
    data: secretData,
  });

  const argsJsonFilePath = `${homePath}/args.json`;
  const awsAuthVolume = createK8sVolume({
    name: "aws-auth",
    secret: {
      secretName: awsAuthSecretName,
      defaultMode: 0o600,
    },
  });

  const awsAuthVolumeMount = createK8sVolumeMount({
    name: "aws-auth",
    mountPath: `${homePath}/.aws`,
  });

  const statefulSet = createK8sStatefulSet({
    metadata: {
      name: "tako",
      namespace,
    },
    spec: {
      serviceName: "tako",
      podManagementPolicy: "Parallel",
      updateStrategy: {
        rollingUpdate: {
          maxUnavailable: Math.max(1, replicas - 1),
        },
      },
      replicas,
      selector: {
        matchLabels: labels,
      },
      template: {
        metadata: {
          labels,
          annotations: {
            "helmet.run/dependency-hash": await stableDigest(secret),
          },
        },
        spec: {
          volumes: [
            awsAuthVolume,
            {
              name: "secrets",
              secret: {
                secretName: secret.metadata.name,
                defaultMode: 0o600,
                items: Object.keys(secretData).map((key) => ({
                  key,
                  path: key,
                })),
              },
            },
          ],
          serviceAccountName: serviceAccount.metadata.name,
          securityContext: {
            runAsUser: 1000,
            runAsGroup: 1000,
            fsGroup: 1000,
          },
          nodeSelector,
          tolerations,
          affinity,
          topologySpreadConstraints,
          terminationGracePeriodSeconds,
          shareProcessNamespace: true,
          enableServiceLinks: false,
          containers: [
            {
              name: "tako",
              image,
              resources: resourceRequirements,
              env: [
                {
                  name: "LOG_LEVEL",
                  value: "debug",
                },
                {
                  name: "POD_NAME",
                  valueFrom: {
                    fieldRef: {
                      fieldPath: "metadata.name",
                    },
                  },
                },
                ...extraEnv,
              ],
              args: [
                "--fargs",
                argsJsonFilePath,
                "--lease.identity=$(POD_NAME)",
              ],
              volumeMounts: [
                {
                  name: "secrets",
                  readOnly: true,
                  mountPath: sshPrivateKeyPath,
                  subPath: "ssh_id",
                },
                {
                  name: "secrets",
                  readOnly: true,
                  mountPath: argsJsonFilePath,
                  subPath: "args.json",
                },
                awsAuthVolumeMount,
              ],
              livenessProbe: {
                exec: {
                  command: [
                    "bash",
                    "-euo",
                    "pipefail",
                    "-c",
                    stripMargin`
                        |if [[ -f "${leaseIdentityFilePath}" ]]; then
                        |  kubectl get lease -n ${namespace} ${name} -o json | jq -e --arg identity "$(cat "${leaseIdentityFilePath}")" '
                        |   .spec |
                        |   if .holderIdentity != $identity or
                        |     (now - (.renewTime | sub("\\\\.[0-9]+Z$"; "Z") | fromdateiso8601) >= (.leaseDurationSeconds - ${leaseRenewalMaxAllowedLagSeconds})) 
                        |   then false else true end'
                        |fi
                        `,
                  ],
                },
                initialDelaySeconds: 2,
                periodSeconds: livenessProbePeriodSeconds,
                timeoutSeconds: 2,
                failureThreshold: 1,
                successThreshold: 1,
              },
            },
          ],
        },
      },
    },
  });

  return {
    crd: takoWarmEc2NodeCrd,
    statefulSet,
    serviceAccount,
    clusterRole,
    clusterRoleBinding,
    secret,
    systemRole,
    systemRoleBinding,
    role,
    roleBinding,
  };
}
