FROM shopstic/bin-dumb-init:1.2.2 as bin-dumb-init
FROM shopstic/bin-deno:1.14.3 as bin-deno

FROM ubuntu:20.10

SHELL ["/bin/bash", "-c"]
RUN \
  apt-get update && \
  apt-get install -y curl gnupg && \
  echo "deb https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_20.10/ /" | tee /etc/apt/sources.list.d/devel:kubic:libcontainers:stable.list && \
  curl -L https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_20.10/Release.key | apt-key add - && \
  apt-get update && \
  apt-get -y upgrade && \
  apt-get install -y git skopeo

COPY --from=bin-dumb-init /usr/bin/dumb-init /usr/bin/dumb-init
COPY --from=bin-deno /usr/bin/deno /usr/bin/deno

RUN \
  groupadd --gid 5000 app && \
  useradd --home-dir /home/app --create-home --uid 5000 \
  --gid 5000 --shell /bin/bash --skel /dev/null app

COPY ./.ssh /home/app/.ssh

RUN \
  chown -R app:app /home/app/.ssh && \
  chmod 700 /home/app/.ssh

COPY ./iac_version_bumper.js /home/app/app.js
COPY ./entrypoint.sh /home/app/entrypoint.sh

ENTRYPOINT ["/home/app/entrypoint.sh"]
