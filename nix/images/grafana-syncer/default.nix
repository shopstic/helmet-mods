{ lib
, stdenv
, buildEnv
, nonRootShadowSetup
, nix2container
, deno
, dumb-init
, writeTextDir
, runCommand
, bash
, grafana-syncer
}:
let
  name = "grafana-syncer";
  user = "app";
  shadow = nonRootShadowSetup { inherit user; uid = 1001; shellBin = "/bin/false"; };
  home-dir = runCommand "home-dir" { } ''mkdir -p $out/home/${user}'';
  nix-bin = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      dumb-init
      deno
    ];
  };
  image = nix2container.buildImage {
    inherit name;
    tag = grafana-syncer.version;
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
      entrypoint = [ "dumb-init" "--" "deno" "run" "--cached-only" "-A" grafana-syncer "run" ];
      user = "${user}:${user}";
    };
  };
in
image // {
  dir = runCommand "${name}-dir" { } "${image.copyTo}/bin/copy-to dir:$out";
}


