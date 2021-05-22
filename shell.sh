#!/usr/bin/env bash
set -euo pipefail

export DOCKER_SCAN_SUGGEST=false
export DOCKER_BUILDKIT=1

TEMP_FILE=$(mktemp)
trap "rm -f ${TEMP_FILE}" EXIT

docker build ./shell --iidfile "${TEMP_FILE}"
IMAGE_ID=$(cat "${TEMP_FILE}")

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