#!/usr/bin/env bash
set -euo pipefail
shopt -s globstar

deno_which_depends_on() {
  local dir_path=${1:?"Directory path is required"}
  local grep_pattern=${2:?"Grep pattern is required"}

  process_file() {
    local file_path="$1"
    local output
    output=$(deno info "$file_path" 2>/dev/null | grep -e "$grep_pattern")

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
  local arch=${1:?"Arch is required"}
  local deno_dir=${2:?"Target path is required"}
  local cache_dir
  nix build --no-link -v ".#packages.${arch}.deno-cache-dir"
  cache_dir=$(nix path-info ".#packages.${arch}.deno-cache-dir") || exit $?
  for dir in deps npm remote registries; do
    if [ -d "${cache_dir}/${dir}" ]; then
      ln -s "${cache_dir}/${dir}" "${deno_dir}/${dir}"
    fi
  done
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
  local app=${1:?"App path is required"}
  local out=${2:?"Output path is required"}

  deno check "${app}"
  # local app_ret
  # app_ret=$(deno-app-build --allow-npm-specifier --app-path="${app}" --out-path="${temp_dir}") || exit $?

  local temp_dir
  temp_dir=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -Rf ${temp_dir}" EXIT

  deno-ship trim-lock --config deno.json --lock deno.lock "${app}" >"${temp_dir}/deno.lock"
  deno compile --lock="${temp_dir}/deno.lock" --cached-only -A --output="${out}" "${app}"
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
  test_app ./src/apps/tako/tako.ts
  test
}

test_app() {
  local app=${1:?"App path is required"}
  local out
  out="$(mktemp -d)/$(basename "${app}" .ts)"
  # shellcheck disable=SC2064
  trap "rm -Rf ${out}" EXIT
  compile_app "${app}" "${out}"
  test_run_app "${out}"
}

test_run_app() {
  local out
  if ! out=$("$@" 2>&1); then
    if ! echo "$out" | grep -q "No command provided"; then
      echo "App run failed, output:"
      echo "${out}"
      exit 1
    fi
  fi
}

generate_image_tag() {
  local current_sha
  current_sha=$(git rev-parse HEAD) || exit $?

  echo "dev-${current_sha}"
}

image_arch_to_nix_arch() {
  local image_arch=${1:?"Image arch is required (amd64 | arm64)"}

  if [[ "${image_arch}" == "arm64" ]]; then
    echo "aarch64"
  elif [[ "${image_arch}" == "amd64" ]]; then
    echo "x86_64"
  else
    echo >&2 "Invalid image arch of ${image_arch}"
    exit 1
  fi
}

build_all_images() {
  local arch=${1:?"Arch is required (amd64 | arm64)"}

  local nix_arch
  nix_arch=$("$0" image_arch_to_nix_arch "${arch}") || exit $?

  time nix build -L -v ".#packages.${nix_arch}-linux.all-images"
}

push_all_single_arch_images() {
  local image_arch=${1:?"Arch is required (amd64 | arm64)"}
  readarray -t images < <(find ./nix/images -mindepth 1 -maxdepth 1 -type d -exec basename {} \;)

  for image in "${images[@]}"; do
    echo "Pusing ${image} - ${image_arch}" >&2
    "$0" push_single_arch "${image}" "${image_arch}"
  done
}

push_all_manifests() {
  readarray -t images < <(find ./nix/images -mindepth 1 -maxdepth 1 -type d -exec basename {} \;)

  parallel -j8 --tagstring "[{}]" --line-buffer \
    "$0" push_manifest {} ::: "${images[@]}"
}

push_single_arch() {
  local image_repository=${IMAGE_REPOSITORY:?"IMAGE_REPOSITORY env var is required"}
  local image_push_skip_diffing=${IMAGE_PUSH_SKIP_DIFFING:-"0"}

  local image=${1:?"Image name is required"}
  local arch=${2:?"Arch is required (amd64 | arm64)"}

  local nix_arch
  nix_arch=$("$0" image_arch_to_nix_arch "${arch}") || exit $?

  local image_tag
  image_tag=$("$0" generate_image_tag) || exit $?

  local file_name
  file_name=$(nix eval --raw ".#packages.${nix_arch}-linux.image-${image}.name") || exit $?

  local target_image="${image_repository}/${image}:${image_tag}-${arch}"
  local last_image="${image_repository}/${image}:latest-${arch}"

  local nix_store_path
  nix_store_path=$(realpath "./result/${file_name}")

  local last_image_nix_store_path=""
  if [[ "${image_push_skip_diffing}" == "0" ]]; then
    last_image_nix_store_path=$(regctl manifest get --format='{{jsonPretty .}}' "${last_image}" | jq -r '.annotations["nix.store.path"]') || true
  else
    echo "Skipping diffing of last image" >&2
  fi

  if [[ "${last_image_nix_store_path}" == "${nix_store_path}" ]]; then
    echo "Last image ${last_image} already exists with nix.store.path annotation of ${nix_store_path}"
    regctl index create "${target_image}" --ref "${last_image}" --annotation nix.store.path="${nix_store_path}" --platform linux/"${arch}"
  else
    echo "Last image ${last_image} nix.store.path=${last_image_nix_store_path} does not match ${nix_store_path}"
    echo "Pushing image ${target_image}"
    skopeo copy --dest-compress-format="zstd:chunked" --insecure-policy --image-parallel-copies 30 --retry-times 5 nix:"${nix_store_path}" docker://"${target_image}"
    regctl index create "${target_image}" --ref "${target_image}" --annotation nix.store.path="${nix_store_path}" --platform linux/"${arch}"
    regctl index create "${last_image}" --ref "${target_image}" --annotation nix.store.path="${nix_store_path}" --platform linux/"${arch}"
  fi
}

push_manifest() {
  local image_repository=${IMAGE_REPOSITORY:?"IMAGE_REPOSITORY env var is required"}
  local image=${1:?"Image name is required"}
  local image_tag
  image_tag=$("$0" generate_image_tag) || exit $?

  local target="${image_repository}/${image}:${image_tag}"

  echo >&2 "Writing manifest for ${target}"
  regctl index create "${target}" \
    --ref "${image_repository}/${image}:${image_tag}-amd64" \
    --ref "${image_repository}/${image}:${image_tag}-arm64" \
    --platform linux/amd64 \
    --platform linux/arm64
  regctl index create "${image_repository}/${image}:latest" \
    --ref "${target}" \
    --platform linux/amd64 \
    --platform linux/arm64
}

release_image() {
  local image_repository=${IMAGE_REPOSITORY:?"IMAGE_REPOSITORY env var is required"}
  local image=${1:?"Image name is required"}
  local dev_tag=${2:?"Image dev tag is required"}
  local release_tag=${3:?"Image release tag is required"}

  local from_image
  from_image="${image_repository}/${image}:${dev_tag}"

  echo "Fetching digest for ${from_image}" >&2
  local digest
  digest=$(regctl image digest "${from_image}") || exit $?

  local to_image
  to_image="${image_repository}/${image}:${release_tag}"
  echo "Tagging ${to_image} with digest ${digest}" >&2
  regctl index create "${to_image}" \
    --ref "${from_image}" \
    --platform linux/amd64 \
    --platform linux/arm64

  local app_name
  app_name=$(echo "${image}" | sed 's/-/_/g') || exit $?

  echo "export const image = \"${image_repository}/${image}@${digest}\";" >"./src/apps/${app_name}/meta.ts"
}

release() {
  local image_repository=${IMAGE_REPOSITORY:?"IMAGE_REPOSITORY env var is required"}
  local dev_tag=${1:?"Image dev tag is required"}
  local release_version=${2:?"Release version is required"}

  local release_branch="releases/${release_version}"

  git config --global user.email "ci-runner@shopstic.com"
  git config --global user.name "CI Runner"
  git checkout -b "${release_branch}"

  readarray -t images < <(find ./nix/images -mindepth 1 -maxdepth 1 -type d -exec basename {} \;)

  parallel -j6 --tagstring "[{}]" --line-buffer --retries=2 \
    "$0" release_image {} "${dev_tag}" "${release_version}" ::: "${images[@]}"

  echo "export default \"${release_version}\";" >./src/version.ts
  local jsr_json
  jsr_json=$(jq -e --arg version "${release_version}" '.version=$version' ./deno.json)
  echo "${jsr_json}" >./deno.json

  git add ./src/apps/*/meta.ts ./src/version.ts ./deno.json
  git commit -m "Release ${release_version}"

  "$0" jsr_publish

  git push origin "${release_branch}"
  gh release create "${release_version}" --title "Release ${release_version}" --notes "" --target "${release_branch}"
}

gen_github_openapi_types() {
  local spec_url=${1:-"https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json"}
  local dir
  dir="$(dirname "$(realpath "$0")")"
  local formatter_dir
  formatter_dir=$(mktemp -d)
  local out="$dir"/src/libs/github/openapi_types.ts
  # shellcheck disable=SC2064
  trap "rm -Rf ${formatter_dir}" EXIT

  cat <<EOF >"${formatter_dir}/formatter.mjs"
export default (node) => {
  if (node.format === "int-or-string") {
    return "string | number";
  }
}
EOF

  cat <<EOF >"${out}"
// deno-lint-ignore-file
/* eslint-disable */
// Generated from ${spec_url}
EOF
  openapi-ts-gen <(curl -sf "${spec_url}") "${formatter_dir}/formatter.mjs" >>"${out}"
  deno fmt "${out}"
}

gen_grafana_openapi_types() {
  local spec_url=${1:-"https://raw.githubusercontent.com/grafana/grafana/v10.4.1/public/openapi3.json"}
  local dir
  dir="$(dirname "$(realpath "$0")")"
  local out="$dir"/src/libs/grafana/openapi_types.ts
  cat <<EOF >"${out}"
// deno-lint-ignore-file
/* eslint-disable */
// Generated from ${spec_url}
EOF
  openapi-ts-gen <(curl -sf "${spec_url}") >>"${out}"
  deno fmt "${out}"
}

gen_tailscale_api_types() {
  local dir
  dir="$(dirname "$(realpath "$0")")"
  local out_file="${dir}"/src/apps/tako/gen/tailscale_api.ts

  mkdir -p "$(dirname "${out_file}")"
  {
    echo "// deno-lint-ignore-file no-empty-interface"
    openapi-ts-gen <(curl -sL "https://api.tailscale.com/api/v2?outputOpenapiSchema=true")
  } >"${out_file}"
  deno fmt "${out_file}"
}

jsr_publish() {
  deno publish --config ./deno.json --allow-slow-types --allow-dirty "$@"
}

update_images() {
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  json_file="${script_dir}/src/images.json"

  if [ ! -f "$json_file" ]; then
    echo "File not found at ${json_file}!"
    exit 1
  fi

  keys=$(jq -r 'keys[]' "$json_file")
  declare -A jobs

  update_digest() {
    local key=$1
    local tmp_result="${tmp_dir}/${key}.txt"
    local image
    local new_digest
    local image_base
    local updated_image

    image=$(jq -r --arg key "$key" '.[$key]' "$json_file")
    image_base=$(echo "$image" | cut -d '@' -f 1)
    echo "Updating digest for ${image_base}..."
    new_digest=$(regctl image digest "$image_base") || exit $?

    updated_image="${image_base}@${new_digest}"
    echo "$updated_image" >"$tmp_result"
  }

  # Create a temporary directory to store individual results
  tmp_dir=$(mktemp -d)

  # Kick off all jobs in parallel
  for key in $keys; do
    update_digest "$key" &
    jobs[$key]=$!
  done

  # Wait for all jobs to finish
  for key in "${!jobs[@]}"; do
    wait "${jobs[$key]}"
  done

  # Collect results into an associative array
  declare -A images
  for key in $keys; do
    tmp_result="${tmp_dir}/${key}.txt"
    images[$key]=$(cat "$tmp_result")
  done

  # Remove temporary directory
  rm -r "$tmp_dir"

  # Update the JSON file
  tmp_json=$(mktemp)
  for key in "${!images[@]}"; do
    jq --arg key "$key" --arg value "${images[$key]}" '.[$key] = $value' "$json_file" >"$tmp_json"
    mv "$tmp_json" "$json_file"
  done

  echo "Successfully updated all image digests."
}

update_deps() {
  local pkg
  pkg=$(jq -er '.imports["@wok/deup"]' <deno.json) || exit $?
  deno run -A "${pkg}" update "$@"
  "$0" update_lock
}

"$@"
