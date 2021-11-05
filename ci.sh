#!/usr/bin/env bash
set -euo pipefail

start_buildkitd() {
  BUILDKITD_CONTAINER_ID=$(./cli.sh start_buildkitd -d)

  for i in {1..10}; do
    if docker logs "${BUILDKITD_CONTAINER_ID}" 2>&1 | grep "running server on"; then
      exit 0
    fi
    sleep 0.5
  done
  
  echo "Timed out waiting for buildkitd container to be ready. Logs:"
  docker logs "${BUILDKITD_CONTAINER_ID}"
  exit 1
}

build_dev() {
  ./cli.sh update_cache
  ./cli.sh code_quality
  ./cli.sh test
  ./cli.sh build_apps
  ./cli.sh test_run_apps
  ./cli.sh build_images --output dev_null
}

build_release() {
  if ls "${DENO_DIR}" > /dev/null 2>&1; then
    du -sh "${DENO_DIR}"
  fi

  git config --global user.email "ci-runner@shopstic.com"
  git config --global user.name "CI Runner"
  git fetch origin release
  git checkout release
  git merge origin/main

  set -euo pipefail

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