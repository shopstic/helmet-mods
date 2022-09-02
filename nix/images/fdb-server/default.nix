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
}:
let
  name = "fdb-server";
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
    ];
  };
  scripts = ./scripts;
  entrypoint = writeShellScript "entrypoint" ''
    set -euo pipefail
    SCRIPT_NAME=''${1:?"Script name is required (either fdb_server.sh or backup_agent.sh"}
    exec dumb-init -- "${scripts}/$SCRIPT_NAME" "''${@:2}"
  '';
  image = nix2container.buildImage
    {
      inherit name;
      tag = fdb.version;
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
        entrypoint = [ entrypoint ];
      };
    };
in
image // {
  dir = runCommand "${name}-dir" { } "${image.copyTo}/bin/copy-to dir:$out";
}
