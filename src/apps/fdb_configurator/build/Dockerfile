FROM shopstic/bin-dumb-init:1.2.2 as bin-dumb-init
FROM shopstic/bin-kubectl:1.21.4 as bin-kubectl
FROM shopstic/bin-deno:1.14.3 as bin-deno
FROM foundationdb/foundationdb:6.3.15 as fdb

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
COPY --from=fdb /usr/lib/libfdb_c.so /usr/lib/libfdb_c.so
COPY --from=fdb /usr/bin/fdbcli /usr/bin/fdbcli
COPY --from=fdb /usr/lib/fdb/multiversion/libfdb_c_6.2.25.so /usr/lib/fdb/multiversion/libfdb_c_6.2.25.so

USER app:app
WORKDIR /home/app

COPY ./fdb_configurator.js /home/app/fdb_configurator.js
COPY ./fdb_configurator.sh /home/app/fdb_configurator.sh

ENTRYPOINT ["/home/app/fdb_configurator.sh"]