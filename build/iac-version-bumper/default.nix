{ lib
, stdenv
, deno
, dumb-init
, cacert
, gitMinimal
, regclient
, runCommand
, writeTextFile
, buildahBuild
, dockerTools
, iacVersionBumper
}:
let
  name = "iac-version-bumper";
  baseImage = buildahBuild
    {
      name = "${name}-base";
      context = ./context;
      buildArgs = {
        fromDigest = "sha256:626ffe58f6e7566e00254b638eb7e0f3b11d4da9675088f4781a50ae288f3322";
      };
      outputHash =
        if stdenv.isx86_64 then
          "sha256-haz88dV78PNL12ftmNzdqYl3QoneamoSnIPJvXxkGc0=" else
          "sha256-21vB6+i31P/7X500pWrQmWCUccc4QeAZbJCiPE4BUZc=";
    };
  entrypoint = writeTextFile {
    name = "entrypoint";
    executable = true;
    text = ''
      #!/usr/bin/env bash
      set -euo pipefail

      COMMITTER_NAME=''${COMMITTER_NAME:?"COMMITTER_NAME env variable is required"}
      COMMITTER_EMAIL=''${COMMITTER_EMAIL:?"COMMITTER_EMAIL env variable is required"}
  
      cat << EOF > /home/app/.gitconfig
      [user]
          name = ''${COMMITTER_NAME}
          email = ''${COMMITTER_EMAIL}
      EOF

      exec dumb-init -- deno run --cached-only -A ${iacVersionBumper} auto-bump-versions "$@"
    '';
  };
  baseImageWithDeps = dockerTools.buildImage {
    name = name;
    fromImage = baseImage;
    config = {
      Env = [
        "PATH=${lib.makeBinPath [ dumb-init deno gitMinimal regclient.regctl ]}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
        "SSL_CERT_FILE=${cacert.out}/etc/ssl/certs/ca-bundle.crt"
      ];
    };
  };
in
dockerTools.buildLayeredImage {
  name = name;
  fromImage = baseImageWithDeps;
  config = {
    Entrypoint = [ entrypoint ];
  };
}

