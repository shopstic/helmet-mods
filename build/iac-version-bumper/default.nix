{ lib
, stdenv
, deno
, dumb-init
, cacert
, gitMinimal
# , skopeo
, manifest-tool
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
          "sha256-lLrIXogPUdp4Tqrt5g+CE8hftUUvlBY02gYvnNxGpfw=" else
          "sha256-qlFkdscv947ACIXCfozZ4AIhRGr21U+3rk0V8S7ik1A=";
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

      exec dumb-init -- deno run --cached-only --unstable -A ${iacVersionBumper} auto-bump-versions "$@"
    '';
  };
  baseImageWithDeps = dockerTools.buildImage {
    name = name;
    fromImage = baseImage;
    config = {
      Env = [
        "PATH=${lib.makeBinPath [ dumb-init deno gitMinimal manifest-tool ]}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
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

