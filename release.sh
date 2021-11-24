#!/usr/bin/env bash
set -euo pipefail

push_image() {
  local NAME=${1:?"Image name is required"}
  local TAG=${2:?"Tag is required"}
  local DIGEST_FILE=$(mktemp)

  skopeo copy \
    --insecure-policy \
    --digestfile="${DIGEST_FILE}" \
    docker-archive:./result/"${NAME}".tar.gz \
    docker://docker.io/shopstic/"${NAME}":"${TAG}" 1>&2

  cat "${DIGEST_FILE}"
}

push_multi_arch_manifest() {
  local IMAGE=${1:?"Image is required"}
  local TAG=${2:?"Tag is required"}
  shift
  shift

  local FLAGS=()

  for DIGEST in "$@"
  do
    FLAGS+=("--amend" "${IMAGE}@${DIGEST}")
  done

  docker manifest create "${IMAGE}:${TAG}" "${FLAGS[@]}" 1>&2
  docker manifest push "${IMAGE}:${TAG}"
}

release() {
  RELEASE_VERSION=${1:?"Release version is required"}

  local CURRENT_SHA
  CURRENT_SHA=$(git rev-parse HEAD)

  IMAGE_TAG=${2:-"dev-${CURRENT_SHA}"}

  local FDB_SERVER_MANIFEST
  local FDB_CONFIGURATOR_MANIFEST
  local IAC_VERSION_BUMPER_MANIFEST

  FDB_SERVER_MANIFEST=$(manifest-tool inspect --raw docker.io/shopstic/fdb-server:"${IMAGE_TAG}" | jq -r '.digest')
  FDB_CONFIGURATOR_MANIFEST=$(manifest-tool inspect --raw docker.io/shopstic/fdb-configurator:"${IMAGE_TAG}" | jq -r '.digest')
  IAC_VERSION_BUMPER_MANIFEST=$(manifest-tool inspect --raw docker.io/shopstic/iac-version-bumper:"${IMAGE_TAG}" | jq -r '.digest')

  local RELEASE_BRANCH="releases/${RELEASE_VERSION}"

  git config --global user.email "ci-runner@shopstic.com"
  git config --global user.name "CI Runner"
  git checkout -b "${RELEASE_BRANCH}"

  patch_app_meta ./src/apps/fdb/meta.ts fdb-server "${FDB_SERVER_MANIFEST}"
  patch_app_meta ./src/apps/fdb_configurator/meta.ts fdb-configurator "${FDB_CONFIGURATOR_MANIFEST}"
  patch_app_meta ./src/apps/iac_version_bumper/meta.ts iac-version-bumper "${IAC_VERSION_BUMPER_MANIFEST}"

  echo "export default \"${RELEASE_VERSION}\";" > ./src/version.ts

  git add ./src/apps/*/meta.ts ./src/version.ts
  git commit -m "Release ${RELEASE_VERSION}"
  git push origin "${RELEASE_BRANCH}"

  gh release create "${RELEASE_VERSION}" --title "Release ${RELEASE_VERSION}" --notes "" --target "${RELEASE_BRANCH}"
}

patch_app_meta() {
  local META_PATH=${1:?"Path is required"}
  local IMAGE_NAME=${2:?"Image name is required"}
  local DIGEST=${3:?"Digest is required"}

  echo "export const image = \"docker.io/shopstic/${IMAGE_NAME}@${DIGEST}\";" > "${META_PATH}"
}

"$@"
