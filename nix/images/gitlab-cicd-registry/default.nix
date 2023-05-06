{ lib
, stdenv
, runCommand
, buildEnv
, nonRootShadowSetup
, nix2container
, dumb-init
, kubectl
, gitlab-cicd-registry
}:
let
  name = "gitlab-cicd-registry";
  user = "app";
  shadow = nonRootShadowSetup { inherit user; uid = 1001; shellBin = "/bin/false"; };
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
    tag = gitlab-cicd-registry.version;
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
      entrypoint = [ "dumb-init" "--" "${gitlab-cicd-registry}/bin/${gitlab-cicd-registry.name}" "run" ];
      user = "${user}:${user}";
    };
  };
in
image // {
  dir = runCommand "${name}-dir" { } "${image.copyTo}/bin/copy-to dir:$out";
}


