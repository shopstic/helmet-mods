#!/usr/bin/env bash
set -euo pipefail

CONTAINER_REGISTRY_REPO=${CONTAINER_REGISTRY_REPO:-"docker.io/shopstic"}
BUILDKITD_TCP_PORT=${BUILDKITD_TCP_PORT:-"18765"}
export BUILDKIT_HOST=${BUILDKIT_HOST:-"tcp://localhost:${BUILDKITD_TCP_PORT}"}

code_quality() {
  echo "Checking formatting..."
  deno fmt --unstable --check ./src
  echo "Linting..."
  deno lint --unstable ./src
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
    --net=host \
    --security-opt seccomp=unconfined \
    --security-opt apparmor=unconfined \
    --device /dev/fuse \
    moby/buildkit:v0.8.2-rootless \
    --oci-worker-no-process-sandbox \
    --addr "tcp://0.0.0.0:${BUILDKITD_TCP_PORT}"
}

build_apps() {
  local GIT_REF=${GIT_REF:-"latest"}
  deno run --unstable -A ./src/scripts/build.ts build-apps --registryRepo "${CONTAINER_REGISTRY_REPO}" --gitRef "${GIT_REF}" "$@"
}

"$@"