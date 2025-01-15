{ lib
, stdenv
, buildEnv
, nonRootShadowSetup
, nix2container
, runCommand
, dumb-init
, coreutils
, regclient
, cacert
, registry-syncer
}:
let
  name = "registry-syncer";
  user = "app";
  userUid = 1001;
  shadow = nonRootShadowSetup { inherit user; uid = userUid; shellBin = "/bin/false"; };
  home-dir = runCommand "home-dir" { } ''mkdir -p $out/home/${user}'';
  nix-bin = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      dumb-init
      coreutils
      regclient.regctl
    ];
  };
  image = nix2container.buildImage {
    inherit name;
    tag = registry-syncer.version;
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
        "SSL_CERT_FILE=${cacert}/etc/ssl/certs/ca-bundle.crt"
      ];
      workingdir = "/home/${user}";
      entrypoint = [ "dumb-init" "--" "${registry-syncer}/bin/${registry-syncer.name}" "run" ];
      user = "${user}:${user}";
    };
  };
in
image
