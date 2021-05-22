#!/usr/bin/dumb-init /bin/bash
# shellcheck shell=bash
set -euo pipefail

FDB_CONNECTION_STRING=${FDB_CONNECTION_STRING:?"FDB_CONNECTION_STRING env variable is required"}
FDB_PROCESS_CLASS=${FDB_PROCESS_CLASS:?"FDB_PROCESS_CLASS env variable is required"}
FDB_POD_IP=${FDB_POD_IP:?"FDB_POD_IP env variable is required"}
FDB_PROCESS_PORT=${FDB_PROCESS_PORT:?"FDB_PROCESS_PORT env variable is required"}
FDB_MACHINE_ID=${NODE_LABEL_KUBERNETES_IO_HOSTNAME:?"NODE_LABEL_KUBERNETES_IO_HOSTNAME env variable is missing, is env-injector working?"}
FDB_PROCESS_MEMORY=${FDB_PROCESS_MEMORY:-""}

export FDB_CLUSTER_FILE=${FDB_CLUSTER_FILE:-"/app/fdb.cluster"}

echo "${FDB_CONNECTION_STRING}" > "${FDB_CLUSTER_FILE}"

FDB_PROCESS_DATA_DIR=${FDB_PROCESS_DATA_DIR:-"/app/data/data/${FDB_PROCESS_PORT}"}
FDB_PROCESS_LOG_DIR=${FDB_PROCESS_LOG_DIR:-"/app/data/log"}

mkdir -p "${FDB_PROCESS_DATA_DIR}" "${FDB_PROCESS_LOG_DIR}"

FDB_ZONE_ID=${FDB_ZONE_ID:-""}
FDB_DATACENTER_ID=${FDB_DATACENTER_ID:-""}
FDB_DATA_HALL=${FDB_DATA_HALL:-""}

FDB_PUBLIC_ADDRESS=""

if [[ "${FDB_USE_SERVICE_ADDRESS}" == "true" ]]; then
  FDB_K8S_SERVICE_HOST_ENV_NAME=${FDB_K8S_SERVICE_HOST_ENV_NAME:?"FDB_K8S_SERVICE_HOST_ENV_NAME env variable is required"}
  FDB_K8S_SERVICE_PORT_ENV_NAME=${FDB_K8S_SERVICE_PORT_ENV_NAME:?"FDB_K8S_SERVICE_PORT_ENV_NAME env variable is required"}

  if ! printenv "${FDB_K8S_SERVICE_HOST_ENV_NAME}" > /dev/null; then
    echo "Value of env variable '${FDB_K8S_SERVICE_HOST_ENV_NAME}' is empty. Perhaps the corresponding K8s Service resource was not yet created prior to this pod starting up?"
    exit 1
  fi

  if ! printenv "${FDB_K8S_SERVICE_PORT_ENV_NAME}" > /dev/null; then
    echo "Value of env variable '${FDB_K8S_SERVICE_PORT_ENV_NAME}' is empty. Perhaps the corresponding K8s Service resource was not yet created prior to this pod starting up?"
    exit 1
  fi

  FDB_K8S_SERVICE_IP=$(printenv "${FDB_K8S_SERVICE_HOST_ENV_NAME}")
  FDB_K8S_SERVICE_PORT=$(printenv "${FDB_K8S_SERVICE_PORT_ENV_NAME}")

  FDB_PUBLIC_ADDRESS="${FDB_K8S_SERVICE_IP}:${FDB_K8S_SERVICE_PORT}"
else
  FDB_PUBLIC_ADDRESS="${FDB_POD_IP}:${FDB_PROCESS_PORT}"
fi

ARGS=(--class "${FDB_PROCESS_CLASS}" \
  --cluster_file "${FDB_CLUSTER_FILE}" \
  --datadir "${FDB_PROCESS_DATA_DIR}" \
  --listen_address "0.0.0.0:${FDB_PROCESS_PORT}" \
  --locality_machineid "${FDB_MACHINE_ID}" \
  --logdir "${FDB_PROCESS_LOG_DIR}" \
  --public_address "${FDB_PUBLIC_ADDRESS}")

if [[ -n "${FDB_ZONE_ID}" ]]; then
  ARGS+=(--locality_zoneid "${FDB_ZONE_ID}")
fi

if [[ -n "${FDB_DATACENTER_ID}" ]]; then
  ARGS+=(--locality_dcid "${FDB_DATACENTER_ID}")
fi

if [[ -n "${FDB_DATA_HALL}" ]]; then
  ARGS+=(--locality_data_hall "${FDB_DATA_HALL}")
fi

if [[ "${FDB_PROCESS_MEMORY}" != "" ]]; then
  ARGS+=(--memory "${FDB_PROCESS_MEMORY}")
fi

ARGS+=("$@")

echo "/usr/bin/fdbserver ${ARGS[*]}"

exec /usr/bin/fdbserver "${ARGS[@]}"
