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
, registry-authenticator
}:
let
  name = "registry-authenticator";
  user = "app";
  shadow = nonRootShadowSetup { inherit user; uid = 1001; shellBin = "${bash}/bin/bash"; };
  home-dir = runCommand "home-dir" { } ''mkdir -p $out/home/${user}/.aws/cli/cache'';
  nix-bin = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      dumb-init
      coreutils
      bash
      awscli2
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
        mode = "0777";
      }
    ];
    config = {
      env = [
        "PATH=/bin"
      ];
      entrypoint = [ "dumb-init" "--" "${registry-authenticator}/bin/${registry-authenticator.name}" "run" ];
      user = "${user}:${user}";
    };
  };
in
image // {
  dir = runCommand "${name}-dir" { } "${image.copyTo}/bin/copy-to dir:$out";
}

