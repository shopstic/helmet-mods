#!/bin/bash
set -euo pipefail

if [[ -f /home/app/.initially_ready ]]; then
  exit 0
fi

FDB_CONNECTION_STRING=${FDB_CONNECTION_STRING:?"FDB_CONNECTION_STRING env variable is required"}
export FDB_CLUSTER_FILE=${FDB_CLUSTER_FILE:-"/home/app/fdb.cluster"}

echo "${FDB_CONNECTION_STRING}" > "${FDB_CLUSTER_FILE}"

STATUS_JSON=$(fdbcli --exec 'status json') || exit $?

if [[ "$(echo "${STATUS_JSON}" | jq -r '.client.database_status.available == true')" != "true" ]]; then
  echo "The database is not available"
  exit 1
fi

if [[ "$(echo "${STATUS_JSON}" | jq -r '.client.database_status.healthy == true')" != "true" ]]; then
  echo "The database is not healthy"
  exit 1
fi

touch /home/app/.initially_ready