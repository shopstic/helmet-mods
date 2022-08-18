#!/usr/bin/env bash
set -euo pipefail

push_image() {
  local IMAGE_REPOSITORY=${1:?"Image repository is required"}
  local NAME=${2:?"Image name is required"}
  local TAG=${3:?"Tag is required"}

  local DIGEST_FILE=$(mktemp)

  skopeo copy \
    --insecure-policy \
    --digestfile="${DIGEST_FILE}" \
    docker-archive:./result/"${NAME}".tar.gz \
    docker://"${IMAGE_REPOSITORY}"/"${NAME}":"${TAG}" 1>&2

  cat "${DIGEST_FILE}"
}

release() {
  local IMAGE_REPOSITORY=${1:?"Image repository is required"}
  local RELEASE_VERSION=${2:?"Release version is required"}

  local CURRENT_SHA
  CURRENT_SHA=$(git rev-parse HEAD)

  IMAGE_TAG=${3:-"dev-${CURRENT_SHA}"}

  local FDB_SERVER_MANIFEST
  local FDB_CONFIGURATOR_MANIFEST
  local IAC_VERSION_BUMPER_MANIFEST
  local REGISTRY_AUTHENTICATOR_MANIFEST
  local REGISTRY_SYNCER_MANIFEST
  local K8S_JOB_AUTOSCALER_MANIFEST
  local GITHUB_ACTIONS_REGISTRY_MANIFEST

  FDB_SERVER_MANIFEST=$(manifest-tool inspect --raw "${IMAGE_REPOSITORY}"/fdb-server:"${IMAGE_TAG}" | jq -r '.digest') || exit $?
  FDB_CONFIGURATOR_MANIFEST=$(manifest-tool inspect --raw "${IMAGE_REPOSITORY}"/fdb-configurator:"${IMAGE_TAG}" | jq -r '.digest') || exit $?
  IAC_VERSION_BUMPER_MANIFEST=$(manifest-tool inspect --raw "${IMAGE_REPOSITORY}"/iac-version-bumper:"${IMAGE_TAG}" | jq -r '.digest') || exit $?
  REGISTRY_AUTHENTICATOR_MANIFEST=$(manifest-tool inspect --raw "${IMAGE_REPOSITORY}"/registry-authenticator:"${IMAGE_TAG}" | jq -r '.digest') || exit $?
  REGISTRY_SYNCER_MANIFEST=$(manifest-tool inspect --raw "${IMAGE_REPOSITORY}"/registry-syncer:"${IMAGE_TAG}" | jq -r '.digest') || exit $?
  K8S_JOB_AUTOSCALER_MANIFEST=$(manifest-tool inspect --raw "${IMAGE_REPOSITORY}"/k8s-job-autoscaler:"${IMAGE_TAG}" | jq -r '.digest') || exit $?
  GITHUB_ACTIONS_REGISTRY_MANIFEST=$(manifest-tool inspect --raw "${IMAGE_REPOSITORY}"/github-actions-registry:"${IMAGE_TAG}" | jq -r '.digest') || exit $?

  local RELEASE_BRANCH="releases/${RELEASE_VERSION}"

  git config --global user.email "ci-runner@shopstic.com"
  git config --global user.name "CI Runner"
  git checkout -b "${RELEASE_BRANCH}"

  echo "export const image = \"${IMAGE_REPOSITORY}/fdb-server@${FDB_SERVER_MANIFEST}\";" > ./src/apps/fdb/meta.ts
  echo "export const image = \"${IMAGE_REPOSITORY}/fdb-configurator@${FDB_CONFIGURATOR_MANIFEST}\";" > ./src/apps/fdb_configurator/meta.ts
  echo "export const image = \"${IMAGE_REPOSITORY}/iac-version-bumper@${IAC_VERSION_BUMPER_MANIFEST}\";" > ./src/apps/iac_version_bumper/meta.ts
  echo "export const image = \"${IMAGE_REPOSITORY}/registry-authenticator@${REGISTRY_AUTHENTICATOR_MANIFEST}\";" > ./src/apps/registry_authenticator/meta.ts
  echo "export const image = \"${IMAGE_REPOSITORY}/registry-syncer@${REGISTRY_SYNCER_MANIFEST}\";" > ./src/apps/registry_syncer/meta.ts
  echo "export const image = \"${IMAGE_REPOSITORY}/k8s-job-autoscaler@${K8S_JOB_AUTOSCALER_MANIFEST}\";" > ./src/apps/k8s_job_autoscaler/meta.ts
  echo "export const image = \"${IMAGE_REPOSITORY}/github-actions-registry@${GITHUB_ACTIONS_REGISTRY_MANIFEST}\";" > ./src/apps/github_actions_registry/meta.ts
  echo "export default \"${RELEASE_VERSION}\";" > ./src/version.ts

  git add ./src/apps/*/meta.ts ./src/version.ts
  git commit -m "Release ${RELEASE_VERSION}"
  git push origin "${RELEASE_BRANCH}"

  gh release create "${RELEASE_VERSION}" --title "Release ${RELEASE_VERSION}" --notes "" --target "${RELEASE_BRANCH}"
}

"$@"
