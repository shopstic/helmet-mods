#!/usr/bin/env bash
set -euo pipefail

code_quality() {
  echo "Checking formatting..."
  deno fmt --unstable --check ./src
  echo "Linting..."
  deno lint --unstable ./src
}

test() {
  deno test -A ./src
}

update_cache() {
  deno cache --lock=lock.json ./src/deps/*
}

update_lock() {
  deno cache --reload ./src/deps/*
  deno cache ./src/deps/* --lock ./lock.json --lock-write
}

bundle_app() {
  deno bundle --lock=lock.json "$@"
}

smoke_test() {
  code_quality
  test_app ./src/apps/fdb_configurator/fdb_configurator.ts
  test_app ./src/apps/iac_version_bumper/iac_version_bumper.ts
  test_app ./src/apps/registry_syncer/registry_syncer.ts
  test_app ./src/apps/registry_authenticator/registry_authenticator.ts
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
  if ! OUT=$(deno run -A --unstable "$@" 2>&1); then
    if ! echo "$OUT" | grep -q "No command provided"; then
      echo "App run failed, output:"
      echo "${OUT}"
      exit 1
    fi
  fi
}

"$@"