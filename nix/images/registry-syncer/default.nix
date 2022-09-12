{ lib
, stdenv
, buildEnv
, nonRootShadowSetup
, nix2container
, runCommand
, deno
, dumb-init
, coreutils
, regclient
, cacert
, registry-syncer
}:
let
  name = "registry-syncer";
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
        mode = "0777";
      }
    ];
    config = {
      env = [
        "PATH=/bin"
        "SSL_CERT_FILE=${cacert}/etc/ssl/certs/ca-bundle.crt"
      ];
      entrypoint = [ "dumb-init" "--" "deno" "run" "--cached-only" "-A" registry-syncer "run" ];
      user = "${user}:${user}";
    };
  };
in
image // {
  dir = runCommand "${name}-dir" { } "${image.copyTo}/bin/copy-to dir:$out";
}
