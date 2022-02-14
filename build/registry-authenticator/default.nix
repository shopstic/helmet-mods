{ lib
, stdenv
, deno
, dumb-init
, awscli2
, runCommand
, writeTextFile
, buildahBuild
, dockerTools
, registryAuthenticator
}:
let
  name = "registry-authenticator";
  baseImage = buildahBuild
    {
      name = "${name}-base";
      context = ./context;
      buildArgs = {
        fromDigest = "sha256:669e010b58baf5beb2836b253c1fd5768333f0d1dbcb834f7c07a4dc93f474be";
      };
      outputHash =
        if stdenv.isx86_64 then
          "sha256-N8ZIyRPej1pmB7GOLl48pK31djDLxOskdZAuFWi0XhI=" else
          "sha256-FtwmGOQ/KwcdgsxBPdBBU3IHgi2F379JyllTtVdBDZ8=";
    };
  entrypoint = writeTextFile {
    name = "entrypoint";
    executable = true;
    text = ''
      #!/usr/bin/env bash
      set -euo pipefail
      exec dumb-init -- deno run --cached-only --unstable -A ${registryAuthenticator} run "$@"
    '';
  };
  baseImageWithDeps = dockerTools.buildImage {
    name = name;
    fromImage = baseImage;
    config = {
      Env = [
        "PATH=${lib.makeBinPath [ dumb-init deno awscli2 ]}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
      ];
    };
  };
in
dockerTools.buildLayeredImage {
  name = name;
  fromImage = baseImageWithDeps;
  config = {
    Entrypoint = [ entrypoint ];
    User = "app:app";
  };
}

