#!/usr/bin/env bash
set -euo pipefail

code_quality() {
  echo "Checking formatting..."
  deno fmt --check ./src
  echo "Linting..."
  deno lint ./src
}

test() {
  deno test -A ./src
}

update_cache() {
  deno cache --lock=deno.lock ./src/deps/*
}

update_lock() {
  deno cache --reload --lock ./deno.lock --lock-write ./src/deps/*
}

bundle_app() {
  deno bundle --lock=deno.lock "$@"
}

smoke_test() {
  code_quality
  test_app ./src/apps/fdb_configurator/fdb_configurator.ts
  test_app ./src/apps/iac_version_bumper/iac_version_bumper.ts
  test_app ./src/apps/registry_syncer/registry_syncer.ts
  test_app ./src/apps/registry_authenticator/registry_authenticator.ts
  test_app ./src/apps/k8s_job_autoscaler/k8s_job_autoscaler.ts
  test_app ./src/apps/github_actions_registry/github_actions_registry.ts
  test_app ./src/apps/gitlab_cicd_registry/gitlab_cicd_registry.ts
  test_app ./src/apps/openapi_merger/openapi_merger.ts
  test
}

test_app() {
  local APP=${1:?"App path is required"}
  local OUT="$(mktemp -d)/out.js"
  trap "rm -Rf ${OUT}" EXIT
  bundle_app "${APP}" "${OUT}"
  test_run_app "${OUT}"
}

test_run_app() {
  local OUT
  if ! OUT=$(deno run -A "$@" 2>&1); then
    if ! echo "$OUT" | grep -q "No command provided"; then
      echo "App run failed, output:"
      echo "${OUT}"
      exit 1
    fi
  fi
}

generate_image_tag() {
  local CURRENT_SHA
  CURRENT_SHA=$(git rev-parse HEAD) || exit $?

  echo "dev-${CURRENT_SHA}"
}

image_arch_to_nix_arch() {
  local IMAGE_ARCH=${1:?"Image arch is required (amd64 | arm64)"}

  if [[ "${IMAGE_ARCH}" == "arm64" ]]; then
    echo "aarch64"
  elif [[ "${IMAGE_ARCH}" == "amd64" ]]; then
    echo "x86_64"
  else
     >&2 echo "Invalid image arch of ${IMAGE_ARCH}"
     exit 1
  fi
}

build_all_images() {
  local ARCH=${1:?"Arch is required (amd64 | arm64)"}

  local NIX_ARCH
  NIX_ARCH=$("$0" image_arch_to_nix_arch "${ARCH}") || exit $?

  nix build -L -v ".#packages.${NIX_ARCH}-linux.all-images"
}

push_all_single_arch_images() {
  local IMAGE_ARCH=${1:?"Arch is required (amd64 | arm64)"}
  readarray -t IMAGES < <(find ./nix/images -mindepth 1 -maxdepth 1 -type d -exec basename {} \;)

  parallel -j8 --tagstring "[{}]" --line-buffer --retries=2 \
    "$0" push_single_arch {} "${IMAGE_ARCH}" ::: "${IMAGES[@]}"
}

push_all_manifests() {
  readarray -t IMAGES < <(find ./nix/images -mindepth 1 -maxdepth 1 -type d -exec basename {} \;)

  parallel -j8 --tagstring "[{}]" --line-buffer --retries=2 \
    "$0" push_manifest {} ::: "${IMAGES[@]}"
}

push_single_arch() {
  local IMAGE_REPOSITORY=${IMAGE_REPOSITORY:?"IMAGE_REPOSITORY env var is required"}

  local IMAGE=${1:?"Image name is required"}
  local ARCH=${2:?"Arch is required (amd64 | arm64)"}
  
  local NIX_ARCH
  NIX_ARCH=$("$0" image_arch_to_nix_arch "${ARCH}") || exit $?

  local IMAGE_TAG
  IMAGE_TAG=$("$0" generate_image_tag) || exit $?

  local FILE_NAME
  FILE_NAME=$(nix eval --raw ".#packages.${NIX_ARCH}-linux.image-${IMAGE}.name") || exit $?

  local TARGET_IMAGE="${IMAGE_REPOSITORY}/${IMAGE}:${IMAGE_TAG}-${ARCH}"

  >&2 echo "Pushing ${TARGET_IMAGE}"

  skopeo --insecure-policy copy --dest-tls-verify=false \
    nix:"./result/${FILE_NAME}" \
    "docker://${TARGET_IMAGE}"
}

push_manifest() {
  local IMAGE_REPOSITORY=${IMAGE_REPOSITORY:?"IMAGE_REPOSITORY env var is required"}
  local IMAGE=${1:?"Image name is required"}
  local IMAGE_TAG
  IMAGE_TAG=$("$0" generate_image_tag) || exit $?

  local TARGET="${IMAGE_REPOSITORY}/${IMAGE}:${IMAGE_TAG}"
  
  >&2 echo "Writing manifest for ${TARGET}"

  manifest-tool push from-args \
    --platforms linux/amd64,linux/arm64 \
    --template "${IMAGE_REPOSITORY}/${IMAGE}:${IMAGE_TAG}-ARCH" \
    --target "${TARGET}"
}

release_image() {
  local IMAGE_REPOSITORY=${IMAGE_REPOSITORY:?"IMAGE_REPOSITORY env var is required"}
  local IMAGE=${1:?"Image name is required"}
  local DEV_TAG=${2:?"Image dev tag is required"}
  local RELEASE_TAG=${3:?"Image release tag is required"}

  local DIGEST
  DIGEST=$(regctl manifest digest --list --require-list "${IMAGE_REPOSITORY}/${IMAGE}:${DEV_TAG}") || exit $?

  regctl image copy \
    "${IMAGE_REPOSITORY}/${IMAGE}:${DEV_TAG}" "${IMAGE_REPOSITORY}/${IMAGE}:${RELEASE_TAG}"

  local APP_NAME
  APP_NAME=$(echo "${IMAGE}" | sed 's/-/_/g') || exit $?

  echo "export const image = \"${IMAGE_REPOSITORY}/${IMAGE}@${DIGEST}\";" > "./src/apps/${APP_NAME}/meta.ts"
}

release() {
  local IMAGE_REPOSITORY=${IMAGE_REPOSITORY:?"IMAGE_REPOSITORY env var is required"}
  local DEV_TAG=${1:?"Image dev tag is required"}
  local RELEASE_VERSION=${2:?"Release version is required"}
  
  local RELEASE_BRANCH="releases/${RELEASE_VERSION}"

  git config --global user.email "ci-runner@shopstic.com"
  git config --global user.name "CI Runner"
  git checkout -b "${RELEASE_BRANCH}"

  readarray -t IMAGES < <(find ./nix/images -mindepth 1 -maxdepth 1 -type d -exec basename {} \;)

  for IMAGE in "${IMAGES[@]}"; do
    echo "Retagging ${IMAGE} from ${DEV_TAG} to ${RELEASE_VERSION}"
    "$0" release_image "${IMAGE}" "${DEV_TAG}" "${RELEASE_VERSION}"
  done

  echo "export default \"${RELEASE_VERSION}\";" > ./src/version.ts

  git add ./src/apps/*/meta.ts ./src/version.ts
  git commit -m "Release ${RELEASE_VERSION}"
  git push origin "${RELEASE_BRANCH}"

  gh release create "${RELEASE_VERSION}" --title "Release ${RELEASE_VERSION}" --notes "" --target "${RELEASE_BRANCH}"
}

"$@"