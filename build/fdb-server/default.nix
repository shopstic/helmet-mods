{ buildahBuild
, dockerTools
, lib
, stdenv
, writeTextFile
, dumb-init
, fdb
}:
let
  name = "fdb-server";
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
          "sha256-QY11lw+N+M4lzJk5lmPQD3mCTgtPZMXL6dCwB5Dn5rs=" else
          "sha256-3HcqxEsIVrHOVB6U3/RHI7r5mttUexXV+49wwtD7JZc=";
    };

  scripts = ./scripts;
  entrypoint = writeTextFile {
    name = "entrypoint";
    executable = true;
    text = ''
      #!/usr/bin/env bash
      set -euo pipefail

      SCRIPT_NAME=''${1:?"Script name is required (either fdb_server.sh or backup_agent.sh"}
      shift

      exec dumb-init -- "${scripts}/$SCRIPT_NAME" "$@"
    '';
  };
in
dockerTools.buildLayeredImage {
  name = name;
  fromImage = baseImage;
  config = {
    Entrypoint = [ entrypoint ];
    Env = [ "PATH=${lib.makeBinPath [ dumb-init fdb ]}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" ];
    Cmd = [ "fdb_server.sh" ];
  };
}
