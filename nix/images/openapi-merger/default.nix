{ lib
, stdenv
, buildEnv
, nonRootShadowSetup
, nix2container
, runCommand
, deno
, dumb-init
, coreutils
, fetchzip
, cacert
, openapi-merger
}:
let
  name = "openapi-merger";
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
    ];
  };
  swaggerUiVersion = "4.15.2";
  swagger-ui = fetchzip {
    name = "swagger-ui-${swaggerUiVersion}";
    url = "https://github.com/swagger-api/swagger-ui/archive/refs/tags/v${swaggerUiVersion}.zip";
    sha256 = "sha256-H2VRSil3h9faFTLZFvg0JbObWjlNspkA7jcbl4r4g/k=";
    postFetch = ''
      find $out -mindepth 1 -maxdepth 1 -not -name dist -exec rm -rf {} \;
      mv $out/dist $out/www
      rm -f $out/www/index.html
    '';
  };
  image = nix2container.buildImage {
    inherit name;
    tag = openapi-merger.version;
    copyToRoot = [ nix-bin shadow home-dir swagger-ui ];
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
      entrypoint = [ "dumb-init" "--" "deno" "run" "--cached-only" "-A" openapi-merger "run" ];
      user = "${user}:${user}";
    };
  };
in
image // {
  dir = runCommand "${name}-dir" { } "${image.copyTo}/bin/copy-to dir:$out";
}
