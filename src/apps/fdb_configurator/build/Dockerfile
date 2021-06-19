FROM shopstic/bin-dumb-init:1.2.2 as bin-dumb-init
FROM shopstic/bin-kubectl:1.20.4 as bin-kubectl
FROM shopstic/bin-deno:1.10.3 as bin-deno

FROM shopstic/curl-tar-unzip:1.0.1 as fdb-clients

ENV FDB_VERSION "6.3.15"

RUN \
  curl -Lko /tmp/fdb-clients.deb https://www.foundationdb.org/downloads/${FDB_VERSION}/ubuntu/installers/foundationdb-clients_${FDB_VERSION}-1_amd64.deb

FROM debian:stable-20210408-slim

RUN \
  apt-get update && \
  apt-get install -y procps

RUN \
  groupadd --gid 5000 app && \
  useradd --home-dir /home/app --create-home --uid 5000 \
  --gid 5000 --shell /bin/bash --skel /dev/null app

COPY --from=bin-dumb-init /usr/bin/dumb-init /usr/bin/dumb-init
COPY --from=bin-kubectl /usr/bin/kubectl /usr/bin/kubectl
COPY --from=bin-deno /usr/bin/deno /usr/bin/deno
COPY --from=fdb-clients /tmp/fdb-clients.deb /tmp/fdb-clients.deb

RUN \
  apt-get install /tmp/fdb-clients.deb && \
  rm -f /tmp/fdb-clients.deb

USER app:app
WORKDIR /home/app

COPY ./fdb_configurator.js /home/app/fdb_configurator.js
COPY ./fdb_configurator.sh /home/app/fdb_configurator.sh

ENTRYPOINT ["/home/app/fdb_configurator.sh"]