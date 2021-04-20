ARG BUILD_VERSION

FROM shopstic/bin-dumb-init:1.2.2 as bin-dumb-init
FROM foundationdb/foundationdb:${BUILD_VERSION}

WORKDIR /app
RUN \
  groupadd -r -g 1001 foundationdb && \
  useradd -r -s /bin/false -u 1001 -g 1001 foundationdb && \
  chown -R foundationdb:foundationdb /app

USER foundationdb:foundationdb

COPY --from=bin-dumb-init / /
COPY ./fdb_server.sh /usr/bin/fdb_server.sh

ENTRYPOINT [ "/usr/bin/fdb_server.sh" ]