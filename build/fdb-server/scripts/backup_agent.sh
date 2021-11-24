#!/usr/bin/env bash
set -euo pipefail

FDB_CONNECTION_STRING=${FDB_CONNECTION_STRING:?"FDB_CONNECTION_STRING env variable is required"}
export FDB_CLUSTER_FILE=${FDB_CLUSTER_FILE:-"/home/app/fdb.cluster"}

echo "${FDB_CONNECTION_STRING}" > "${FDB_CLUSTER_FILE}"

ARGS=(-C "${FDB_CLUSTER_FILE}" "$@")

echo "backup_agent ${ARGS[*]}"

exec backup_agent "${ARGS[@]}"
