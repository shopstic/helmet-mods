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
        deno run --cached-only --unstable -A "${fdbConfigurator}" "$@"
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

