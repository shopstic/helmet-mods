{ lib
, stdenv
, buildEnv
, nonRootShadowSetup
, nix2container
, runCommand
, deno
, dumb-init
, coreutils
, awscli2
, registry-authenticator
}:
let
  name = "registry-authenticator";
  user = "app";
  shadow = nonRootShadowSetup { inherit user; uid = 1001; shellBin = "/bin/false"; };
  home-dir = runCommand "home-dir" { } ''mkdir -p $out/home/${user}'';
  nix-bin = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      dumb-init
      coreutils
      deno
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
        regex = "/home/${user}$";
        mode = "0777";
      }
    ];
    config = {
      env = [
        "PATH=/bin"
      ];
      entrypoint = [ "dumb-init" "--" "deno" "run" "--cached-only" "-A" registry-authenticator "run" ];
      user = "${user}:${user}";
    };
  };
in
image // {
  dir = runCommand "${name}-dir" { } "${image.copyTo}/bin/copy-to dir:$out";
}

