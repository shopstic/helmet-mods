{ lib
, stdenv
, writeShellScript
, runCommand
, buildEnv
, nonRootShadowSetup
, nix2container
, deno
, dumb-init
, fdb
, kubectl
, coreutils
, bash
, fdb-configurator
}:
let
  name = "fdb-configurator";
  user = "app";
  shadow = nonRootShadowSetup { inherit user; uid = 1001; shellBin = "${bash}/bin/bash"; };
  home-dir = runCommand "home-dir" { } ''mkdir -p $out/home/${user}'';
  nix-bin = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      coreutils
      bash
      dumb-init
      fdb
      deno
      kubectl
    ];
  };
  entrypoint = writeShellScript "entrypoint.sh" ''
    set -euo pipefail

    FDB_CONNECTION_STRING=''${FDB_CONNECTION_STRING:-""}
  
    if [[ "''${FDB_CONNECTION_STRING}" != "" ]]; then
      echo "FDB_CONNECTION_STRING=''${FDB_CONNECTION_STRING}"
      export FDB_CLUSTER_FILE=''${FDB_CLUSTER_FILE:-"/home/app/fdb.cluster"}
      echo "FDB_CLUSTER_FILE=''${FDB_CLUSTER_FILE}"
    
      echo "''${FDB_CONNECTION_STRING}" > "''${FDB_CLUSTER_FILE}"
    fi

    exec deno run --no-remote --cached-only -A "${fdb-configurator}" "$@"
  '';
  image = nix2container.buildImage
    {
      inherit name;
      tag = fdb-configurator.version;
      copyToRoot = [ nix-bin shadow home-dir ];
      maxLayers = 80;
      perms = [
        {
          path = home-dir;
          regex = "/home/${user}$";
          mode = "0777";
        }
      ];
      config = {
        env = [
          "PATH=/bin"
        ];
        user = "${user}:${user}";
        workingdir = "/home/${user}";
        entrypoint = [ "dumb-init" "--" entrypoint ];
      };
    };
in
image // {
  dir = runCommand "${name}-dir" { } "${image.copyTo}/bin/copy-to dir:$out";
}


