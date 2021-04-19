#!/usr/bin/env bash
set -euo pipefail

export DOCKER_BUILDKIT=1

docker build ./shell
IMAGE_ID=$(docker build -q ./shell)

docker run \
  -it --rm \
  --net=host \
  --hostname=helmet-mods-shell \
  -v "${HOME}/.kube:/root/.kube" \
  -v "${DENO_DIR}:/root/.cache/deno" \
  -e "DENO_DIR=/root/.cache/deno" \
  -e "CONTAINER_REGISTRY_REPO=cr.shopstic.com" \
  -v "${PWD}:${PWD}" \
  -w "${PWD}" \
  "${IMAGE_ID}" \
  bash -l