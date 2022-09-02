#!/bin/bash

FDB_PROCESS_LOG_DIR=${FDB_PROCESS_LOG_DIR:-"/home/app/log"}

tailing_pid=-1
latest_file=""

cleanup() {
  if [[ $tailing_pid != -1 ]]
  then
    kill -15 ${tailing_pid}
  fi
}

find_latest_file() {
  file_name=$(ls -t "${FDB_PROCESS_LOG_DIR}" | head -n 1)
  if [[ $file_name != "" ]]
  then
    echo "${FDB_PROCESS_LOG_DIR}/${file_name}"
  else
    echo "$file_name"
  fi
}

start_tailing_latest_file() {
  if [[ $latest_file != "" ]]
  then
    cleanup
    tail -f "${latest_file}" &
    tailing_pid=$(echo $!)
  fi
}

trap cleanup EXIT

while true
do
  current_latest_file=$(find_latest_file)
  if [[ $current_latest_file != $latest_file ]]
  then
    latest_file=$current_latest_file
    start_tailing_latest_file
  fi
  sleep 1
done
