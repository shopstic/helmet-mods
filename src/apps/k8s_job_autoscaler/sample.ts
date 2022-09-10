import { AutoscaledJob } from "./libs/types.ts";

const autoscaledJob: AutoscaledJob = {
  apiVersion: "shopstic.com/v1",
  kind: "AutoscaledJob",
  metadata: {
    name: "foobar",
    namespace: "cicd",
  },
  spec: {
    autoscaling: {
      query: "vector(1)",
      metricServerUrl: "https://vm.wok.run/prometheus/api/v1",
      intervalSeconds: 5,
      maxReplicas: 5,
    },
    persistentVolumes: [{
      volumeName: "test",
      claimPrefix: "test-pv-",
    }],
    jobTemplate: {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: "my-foo-bar-job",
      },
      spec: {
        ttlSecondsAfterFinished: 10,
        template: {
          spec: {
            containers: [{
              image: "public.ecr.aws/docker/library/alpine:3.16.2",
              name: "main",
              command: ["sh", "-c", "echo 'Sleeping for 60 seconds...'; sleep 60; echo 'Exiting...'"],
              volumeMounts: [{
                name: "test",
                mountPath: "/test",
              }],
            }],
            restartPolicy: "Never",
          },
        },
      },
    },
  },
};

console.log(JSON.stringify(autoscaledJob));
