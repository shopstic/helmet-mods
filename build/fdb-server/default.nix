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
        fromDigest = "sha256:626ffe58f6e7566e00254b638eb7e0f3b11d4da9675088f4781a50ae288f3322";
      };
      outputHash =
        if stdenv.isx86_64 then
          "sha256-4rQmAAiBbCAgn0F/Fu9aE3knHY9z8bCt532OKqRFsug=" else
          "sha256-X508l62NZcdG81C+zwAndARnDN4rayoKC4j8oZSf12Q=";
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
