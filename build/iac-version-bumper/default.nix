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
        fromDigest =
          if stdenv.isx86_64 then
            "sha256:7cc0576c7c0ec2384de5cbf245f41567e922aab1b075f3e8ad565f508032df17" else
            "sha256:26c3bd3ae441c873a210200bcbb975ffd2bbf0c0841a4584f4476c8a5b8f3d99";
      };
      outputHash =
        if stdenv.isx86_64 then
          "sha256-eE6DjVXLNzo/7pUYmKhITsmqfaKX0g9EwKNgMAM34xc=" else
          "sha256-PZj8tTz44mGISDBTHQA+wvf31U5GIJ+wPzcJZ98nr9I=";
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

