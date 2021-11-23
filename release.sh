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

patch_app_meta() {
  local PATH=${1:?"Path is required"}
  local IMAGE_NAME=${2:?"Image name is required"}
  local VERSION=${3:?"Version is required"}

printenv PATH
which cat

cat <<EOF > "${PATH}"
export const version = "${VERSION}";
export const imageName = "${IMAGE_NAME}";

EOF


}

before_commit() {
  git config --global user.email "ci-runner@shopstic.com"
  git config --global user.name "CI Runner"
  git fetch origin release
  git checkout release
  git merge --allow-unrelated-histories -Xtheirs origin/main
}

commit() {
  local VERSION=${1:?"Version is required"}
  echo "export default \"${VERSION}\";" > ./src/version.ts

  git add ./src/apps/*/meta.ts ./src/version.ts
  git commit -m "Release ${VERSION}"
  git tag "${VERSION}"
  git push origin release --tags
}

"$@"
