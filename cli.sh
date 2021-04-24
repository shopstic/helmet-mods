#!/usr/bin/env bash
set -euo pipefail

CONTAINER_REGISTRY_REPO=${CONTAINER_REGISTRY_REPO:-"docker.io/shopstic"}
BUILDKITD_TCP_PORT=${BUILDKITD_TCP_PORT:-"18765"}
export BUILDKIT_HOST=${BUILDKIT_HOST:-"tcp://localhost:${BUILDKITD_TCP_PORT}"}

code_quality() {
  echo "Checking formatting..."
  deno fmt --unstable --ignore=./src/apps/fdb_configurator/build,./src/apps/iac_version_bumper/build --check ./src
  echo "Linting..."
  deno lint --unstable --ignore=./src/apps/fdb_configurator/build,./src/apps/iac_version_bumper/build ./src
}

test() {
  deno test -A ./src
}

start_buildkitd() {
  local ARG
  
  if [[ "$#" == "0" ]]; then
    ARG=("-it" "--rm")
  else
    ARG=("$@")
  fi

  docker run \
    "${ARG[@]}" \
    --init \
    --net=host \
    --security-opt seccomp=unconfined \
    --security-opt apparmor=unconfined \
    --device /dev/fuse \
    moby/buildkit:v0.8.2-rootless \
    --oci-worker-no-process-sandbox \
    --addr "tcp://0.0.0.0:${BUILDKITD_TCP_PORT}"
}

update_cache() {
  deno cache --lock=lock.json ./src/deps/*
}

update_lock() {
  deno cache ./src/deps/* --lock ./lock.json --lock-write
}

build() {
  deno run --cached-only --unstable -A ./src/scripts/build.ts "$@"
}

build_apps() {
  build build-apps "$@"
}

test_run_apps() {
  test_run_app ./src/apps/fdb_configurator/build/fdb_configurator.js
  test_run_app ./src/apps/iac_version_bumper/build/iac_version_bumper.js
}

test_run_app() {
  local OUT
  if ! OUT=$(deno run -A --unstable "$@" 2>&1); then
    if ! echo "$OUT" | grep -q "No command provided"; then
      echo "App run failed, output:"
      echo "${OUT}"
      exit 1
    fi
  fi
}

build_images() {
  local GIT_REF=${GIT_REF:-"latest"}
  build build-images --registryRepo "${CONTAINER_REGISTRY_REPO}" --version "${GIT_REF}" "$@"
}

"$@"