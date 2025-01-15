{ lib
, stdenv
, buildEnv
, nonRootShadowSetup
, nix2container
, runCommand
, dumb-init
, coreutils
, bash
, awscli2
, kubectl
, registry-authenticator
}:
let
  name = "registry-authenticator";
  user = "app";
  userUid = 1001;
  shadow = nonRootShadowSetup { inherit user; uid = userUid; shellBin = "${bash}/bin/bash"; };
  home-dir = runCommand "home-dir" { } ''mkdir -p $out/home/${user}/.aws/cli/cache'';
  nix-bin = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      dumb-init
      coreutils
      bash
      awscli2
      kubectl
    ];
  };
  image = nix2container.buildImage {
    inherit name;
    tag = registry-authenticator.version;
    copyToRoot = [ nix-bin shadow home-dir ];
    maxLayers = 80;
    perms = [
      {
        path = home-dir;
        regex = "/home/${user}";
        mode = "0755";
        gid = userUid;
        uid = userUid;
      }
    ];
    config = {
      env = [
        "PATH=/bin"
      ];
      workingdir = "/home/${user}";
      entrypoint = [ "dumb-init" "--" "${registry-authenticator}/bin/${registry-authenticator.name}" "run" ];
      user = "${user}:${user}";
    };
  };
in
image
