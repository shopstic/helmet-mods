#!/usr/bin/dumb-init /bin/bash
# shellcheck shell=bash
set -euo pipefail

COMMITTER_NAME=${COMMITTER_NAME:?"COMMITTER_NAME env variable is required"}
COMMITTER_EMAIL=${COMMITTER_EMAIL:?"COMMITTER_EMAIL env variable is required"}

cat << EOF > /home/app/.gitconfig
[user]
	name = ${COMMITTER_NAME}
	email = ${COMMITTER_EMAIL}
EOF

deno run --cached-only --unstable -A /home/app/app.js auto-bump-versions "$@"
