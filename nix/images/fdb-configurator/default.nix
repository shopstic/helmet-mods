{ lib
, stdenv
, writeShellScript
, runCommand
, buildEnv
, nonRootShadowSetup
, nix2container
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
  userUid = 1001;
  shadow = nonRootShadowSetup { inherit user; uid = userUid; shellBin = "${bash}/bin/bash"; };
  home-dir = runCommand "home-dir" { } ''mkdir -p $out/home/${user}'';
  nix-bin = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      coreutils
      bash
      dumb-init
      fdb
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

    exec "${fdb-configurator}/bin/${fdb-configurator.name}" "$@"
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
          mode = "0755";
          gid = userUid;
          uid = userUid;
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
image
