{ lib
, stdenv
, deno
, dumb-init
, fdb
, kubectl
, runCommand
, writeTextFile
, buildahBuild
, dockerTools
, fdbConfigurator
}:
let
  name = "fdb-configurator";
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
  entrypoint = writeTextFile {
    name = "entrypoint";
    executable = true;
    text = ''
      #!/usr/bin/env bash
      set -euo pipefail

      FDB_CONNECTION_STRING=''${FDB_CONNECTION_STRING:-""}
  
      if [[ "''${FDB_CONNECTION_STRING}" != "" ]]; then
      echo "FDB_CONNECTION_STRING=''${FDB_CONNECTION_STRING}"
      export FDB_CLUSTER_FILE=''${FDB_CLUSTER_FILE:-"/home/app/fdb.cluster"}
      echo "FDB_CLUSTER_FILE=''${FDB_CLUSTER_FILE}"
  
      echo "''${FDB_CONNECTION_STRING}" > "''${FDB_CLUSTER_FILE}"
      fi

      export PATH="${lib.makeBinPath [ dumb-init deno kubectl fdb ]}:$PATH"
  
      exec dumb-init -- \
        deno run --no-remote --cached-only -A "${fdbConfigurator}" "$@"
    '';
  };
in
dockerTools.buildLayeredImage {
  name = name;
  fromImage = baseImage;
  config = {
    Entrypoint = [ entrypoint ];
  };
}

