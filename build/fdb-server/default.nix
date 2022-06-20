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
        fromDigest = "sha256:62b8f60c5c8e1717f460bb7af05e558b74feb8ac460ff2abbdd3a98becdc15ce";
      };
      outputHash =
        if stdenv.isx86_64 then
          "sha256-NKAxcX9A1OF27iQGtBk8DWkbu7uF1zo1CwLvdPKjfm4=" else
          "sha256-D2glKVuZLyTJJorA+pQn8VqhBZiI6RzW+EZUs3jZw58=";
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
    Entrypoint = [ entrypoint "fdb_server.sh" ];
    Env = [ "PATH=${lib.makeBinPath [ dumb-init fdb ]}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" ];
  };
}
