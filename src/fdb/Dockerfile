FROM shopstic/bin-dumb-init:1.2.2 as bin-dumb-init

FROM foundationdb/foundationdb:6.2.30

WORKDIR /app
RUN \
  groupadd -r -g 1001 foundationdb && \
  useradd -r -s /bin/false -u 1001 -g 1001 foundationdb && \
  chown -R foundationdb:foundationdb /app

USER foundationdb:foundationdb

COPY --from=bin-dumb-init /usr/bin/dumb-init /usr/bin/dumb-init