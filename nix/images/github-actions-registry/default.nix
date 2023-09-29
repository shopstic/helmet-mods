{ lib
, stdenv
, runCommand
, buildEnv
, nonRootShadowSetup
, nix2container
, dumb-init
, kubectl
, github-actions-registry
}:
let
  name = "github-actions-registry";
  user = "app";
  userUid = 1001;
  shadow = nonRootShadowSetup { inherit user; uid = userUid; shellBin = "/bin/false"; };
  home-dir = runCommand "home-dir" { } ''mkdir -p $out/home/${user}'';
  nix-bin = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      dumb-init
      kubectl
    ];
  };
  image = nix2container.buildImage {
    inherit name;
    tag = github-actions-registry.version;
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
      entrypoint = [ "dumb-init" "--" "${github-actions-registry}/bin/${github-actions-registry.name}" "run" ];
      user = "${user}:${user}";
    };
  };
in
image

