#!/usr/bin/env bash
set -euo pipefail
shopt -s globstar

deno_which_depends_on() {
  local dir_path=${1:?"Directory path is required"}
  local grep_pattern=${2:?"Grep pattern is required"}

  process_file() {
    local file_path="$1"
    local output=$(deno info "$file_path" 2>/dev/null | grep -e "$grep_pattern")

    if [ -n "$output" ]; then
      echo "$file_path"
    fi
  }

  # Walk the directory and process each file
  while IFS= read -r -d '' file; do
    process_file "$file"
  done < <(find "$dir_path" -type f -name "*.ts" -print0)
}

populate_deno_dir_from_nix() {
  local ARCH=${1:?"Arch is required"}
  local DENO_DIR=${2:?"Target path is required"}
  local CACHE_DIR
  nix build --no-link -v ".#packages.${ARCH}.deno-cache"
  CACHE_DIR=$(nix path-info ".#packages.${ARCH}.deno-cache") || exit $?
  ln -s "${CACHE_DIR}"/deps "${DENO_DIR}/deps"
  ln -s "${CACHE_DIR}"/npm "${DENO_DIR}/npm"
  ln -s "${CACHE_DIR}"/registries "${DENO_DIR}/registries"
}

code_quality() {
  echo "Checking formatting..."
  deno fmt --check
  echo "Linting..."
  deno lint
  echo "Checking..."
  deno check ./src/**/*.ts
  echo "Running eslint..."
  eslint ./src
}

auto_fmt() {
  deno fmt
}

test() {
  deno test -A ./src
}

update_lock() {
  rm -f ./deno.lock
  deno cache --reload --lock ./deno.lock --frozen=false ./src/**/*.ts
}

bundle_app() {
  deno bundle --lock=deno.lock "$@"
}

compile_app() {
  local APP=${1:?"App path is required"}
  local OUT=${2:?"Output path is required"}

  # local TEMP_DIR
  # TEMP_DIR=$(mktemp -d) || exit $?
  deno check "${APP}"
  # local APP_RET
  # APP_RET=$(deno-app-build --allow-npm-specifier --app-path="${APP}" --out-path="${TEMP_DIR}") || exit $?
  deno compile --cached-only -A --output="${OUT}" "${APP}"
}

smoke_test() {
  code_quality
  test_app ./src/apps/fdb_configurator/fdb_configurator.ts
  test_app ./src/apps/iac_version_bumper/iac_version_bumper.ts
  test_app ./src/apps/registry_syncer/registry_syncer.ts
  test_app ./src/apps/registry_authenticator/registry_authenticator.ts
  test_app ./src/apps/k8s_job_autoscaler/k8s_job_autoscaler.ts
  test_app ./src/apps/grafana_syncer/grafana_syncer.ts
  test_app ./src/apps/github_actions_registry/github_actions_registry.ts
  test_app ./src/apps/gitlab_cicd_registry/gitlab_cicd_registry.ts
  test_app ./src/apps/openapi_merger/openapi_merger.ts
  test
}

test_app() {
  local APP=${1:?"App path is required"}
  local OUT="$(mktemp -d)/$(basename "${APP}" .ts)"
  trap "rm -Rf ${OUT}" EXIT
  compile_app "${APP}" "${OUT}"
  test_run_app "${OUT}"
}

test_run_app() {
  local OUT
  if ! OUT=$("$@" 2>&1); then
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
    echo >&2 "Invalid image arch of ${IMAGE_ARCH}"
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

  parallel -j8 --tagstring "[{}]" --line-buffer --retries=5 \
    "$0" push_single_arch {} "${IMAGE_ARCH}" ::: "${IMAGES[@]}"
}

push_all_manifests() {
  readarray -t IMAGES < <(find ./nix/images -mindepth 1 -maxdepth 1 -type d -exec basename {} \;)

  parallel -j8 --tagstring "[{}]" --line-buffer --retries=5 \
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

  echo >&2 "Pushing ${TARGET_IMAGE}"

  skopeo --insecure-policy copy --dest-tls-verify=false --dest-compress-format="zstd:chunked" \
    nix:"./result/${FILE_NAME}" \
    "docker://${TARGET_IMAGE}"
}

push_manifest() {
  local IMAGE_REPOSITORY=${IMAGE_REPOSITORY:?"IMAGE_REPOSITORY env var is required"}
  local IMAGE=${1:?"Image name is required"}
  local IMAGE_TAG
  IMAGE_TAG=$("$0" generate_image_tag) || exit $?

  local TARGET="${IMAGE_REPOSITORY}/${IMAGE}:${IMAGE_TAG}"

  echo >&2 "Writing manifest for ${TARGET}"

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

  echo "export const image = \"${IMAGE_REPOSITORY}/${IMAGE}@${DIGEST}\";" >"./src/apps/${APP_NAME}/meta.ts"
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

  echo "export default \"${RELEASE_VERSION}\";" >./src/version.ts
  local JSR_JSON
  JSR_JSON=$(jq -e --arg VERSION "${RELEASE_VERSION}" '.version=$VERSION' ./deno.json)
  echo "${JSR_JSON}" >./deno.json

  git add ./src/apps/*/meta.ts ./src/version.ts ./deno.json
  git commit -m "Release ${RELEASE_VERSION}"

  "$0" jsr_publish

  git push origin "${RELEASE_BRANCH}"
  gh release create "${RELEASE_VERSION}" --title "Release ${RELEASE_VERSION}" --notes "" --target "${RELEASE_BRANCH}"
}

gen_github_openapi_types() {
  local SPEC_URL=${1:-"https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json"}
  local DIR="$(dirname "$(realpath "$0")")"
  local FORMATTER_DIR=$(mktemp -d)
  local OUT="$DIR"/src/libs/github/openapi_types.ts
  trap "rm -Rf ${FORMATTER_DIR}" EXIT

  cat <<EOF >"${FORMATTER_DIR}/formatter.mjs"
export default (node) => {
  if (node.format === "int-or-string") {
    return "string | number";
  }
}
EOF

  echo "// deno-lint-ignore-file" >"${OUT}"
  echo "/* eslint-disable */" >>"${OUT}"
  echo "// Generated from ${SPEC_URL}" >>"${OUT}"
  openapi-ts-gen <(curl -sf "${SPEC_URL}") "${FORMATTER_DIR}/formatter.mjs" >>"${OUT}"
  deno fmt "${OUT}"
}

gen_grafana_openapi_types() {
  local SPEC_URL=${1:-"https://raw.githubusercontent.com/grafana/grafana/v10.4.1/public/openapi3.json"}
  local DIR="$(dirname "$(realpath "$0")")"
  local OUT="$DIR"/src/libs/grafana/openapi_types.ts
  echo "// deno-lint-ignore-file" >"${OUT}"
  echo "/* eslint-disable */" >>"${OUT}"
  echo "// Generated from ${SPEC_URL}" >>"${OUT}"
  openapi-ts-gen <(curl -sf "${SPEC_URL}") >>"${OUT}"
  deno fmt "${OUT}"
}

jsr_publish() {
  deno publish --config ./deno.json --allow-slow-types --allow-dirty "$@"
}

update_images() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  JSON_FILE="${SCRIPT_DIR}/src/images.json"

  if [ ! -f "$JSON_FILE" ]; then
    echo "File not found at ${JSON_FILE}!"
    exit 1
  fi

  KEYS=$(jq -r 'keys[]' "$JSON_FILE")
  declare -A JOBS

  update_digest() {
    local KEY=$1
    local TMP_RESULT="${TMP_DIR}/${KEY}.txt"
    local IMAGE
    local NEW_DIGEST
    local IMAGE_BASE
    local UPDATED_IMAGE

    IMAGE=$(jq -r --arg KEY "$KEY" '.[$KEY]' "$JSON_FILE")
    IMAGE_BASE=$(echo $IMAGE | cut -d '@' -f 1)
    echo "Updating digest for ${IMAGE_BASE}..."
    NEW_DIGEST=$(manifest-tool inspect --raw "$IMAGE_BASE" | jq -e -r .digest) || exit $?
    
    UPDATED_IMAGE="${IMAGE_BASE}@${NEW_DIGEST}"
    echo "$UPDATED_IMAGE" > "$TMP_RESULT"
  }

  # Create a temporary directory to store individual results
  TMP_DIR=$(mktemp -d)

  # Kick off all jobs in parallel
  for KEY in $KEYS; do
    update_digest $KEY &
    JOBS[$KEY]=$!
  done

  # Wait for all jobs to finish
  for KEY in "${!JOBS[@]}"; do
    wait ${JOBS[$KEY]}
  done

  # Collect results into an associative array
  declare -A IMAGES
  for KEY in $KEYS; do
    TMP_RESULT="${TMP_DIR}/${KEY}.txt"
    IMAGES[$KEY]=$(cat "$TMP_RESULT")
  done

  # Remove temporary directory
  rm -r "$TMP_DIR"

  # Update the JSON file
  TMP_JSON=$(mktemp)
  for KEY in "${!IMAGES[@]}"; do
    jq --arg KEY "$KEY" --arg VALUE "${IMAGES[$KEY]}" '.[$KEY] = $VALUE' "$JSON_FILE" > "$TMP_JSON"
    mv "$TMP_JSON" "$JSON_FILE"
  done

  echo "Successfully updated all image digests."
}

update_deps() {
  deno run -A jsr:@wok/deup@1.3.1 update "$@"
  "$0" update_lock
}

"$@"
