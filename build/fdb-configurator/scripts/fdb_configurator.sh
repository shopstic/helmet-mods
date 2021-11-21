#!/usr/bin/env bash
set -euo pipefail

FDB_CONNECTION_STRING=${FDB_CONNECTION_STRING:-""}

if [[ "${FDB_CONNECTION_STRING}" != "" ]]; then
  echo "FDB_CONNECTION_STRING=${FDB_CONNECTION_STRING}"
  export FDB_CLUSTER_FILE=${FDB_CLUSTER_FILE:-"/home/app/fdb.cluster"}
  echo "FDB_CLUSTER_FILE=${FDB_CLUSTER_FILE}"
  
  echo "${FDB_CONNECTION_STRING}" > "${FDB_CLUSTER_FILE}"
fi

deno run --unstable -A /home/app/fdb_configurator.js "$@"