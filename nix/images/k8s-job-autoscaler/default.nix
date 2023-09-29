{ lib
, stdenv
, buildEnv
, nonRootShadowSetup
, nix2container
, dumb-init
, writeTextDir
, runCommand
, bash
, k8s-job-autoscaler
}:
let
  name = "k8s-job-autoscaler";
  user = "app";
  userUid = 1001;
  shadow = nonRootShadowSetup { inherit user; uid = userUid; shellBin = "/bin/false"; };
  home-dir = runCommand "home-dir" { } ''mkdir -p $out/home/${user}'';
  nix-bin = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      dumb-init
    ];
  };
  image = nix2container.buildImage {
    inherit name;
    tag = k8s-job-autoscaler.version;
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
      entrypoint = [ "dumb-init" "--" "${k8s-job-autoscaler}/bin/${k8s-job-autoscaler.name}" "run" ];
      user = "${user}:${user}";
    };
  };
in
image


