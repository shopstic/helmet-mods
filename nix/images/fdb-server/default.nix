{ nix2container
, lib
, stdenv
, writeShellScript
, runCommand
, buildEnv
, nonRootShadowSetup
, dumb-init
, fdb
, coreutils
, bash
, jq
}:
let
  name = "fdb-server";
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
      jq
    ];
  };
  scripts-src = ./scripts;
  fdb-scripts = runCommand "fdb-scripts" { } ''
    mkdir -p $out/fdb-scripts
    cp ${scripts-src}/* $out/fdb-scripts/
    chmod +x $out/fdb-scripts/*
  '';
  image = nix2container.buildImage
    {
      inherit name;
      tag = fdb.version;
      copyToRoot = [ nix-bin shadow home-dir fdb-scripts ];
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
          "PATH=/bin:/fdb-scripts"
        ];
        user = "${user}:${user}";
        workingdir = "/home/${user}";
        entrypoint = [ "dumb-init" "--" ];
        cmd = [ "fdb_server.sh" ];
      };
    };
in
image