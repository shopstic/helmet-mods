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
        fromDigest = "sha256:626ffe58f6e7566e00254b638eb7e0f3b11d4da9675088f4781a50ae288f3322";
      };
      outputHash =
        if stdenv.isx86_64 then
          "sha256-/1ZXIDZyT9HPYyP4Ax8DqBvu8NlSFt08CfbXeRu9hbY=" else
          "sha256-3Q62fbLyTB/5mdW+nONah3QYHq45LFgFKZBkzsSvT5I=";
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

