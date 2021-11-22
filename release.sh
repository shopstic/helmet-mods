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
  GIT_REF=${GIT_REF:?"GIT_REF env variable is required"}

  local IAC_VERSION_BUMPER_DIGEST

  git config --global user.email "ci-runner@shopstic.com"
  git config --global user.name "CI Runner"
  git fetch origin release
  git checkout release
  git merge origin/main

  ./cli.sh update_cache
  ./cli.sh code_quality
  ./cli.sh test
  ./cli.sh build_apps
  ./cli.sh test_run_apps
  ./cli.sh build_images --output registry

  git add ./src/apps/*/meta.ts ./src/version.ts
  git commit -m "Release ${GIT_REF}"
  git tag "${GIT_REF}"
  git push origin release --tags
}

"$@"
