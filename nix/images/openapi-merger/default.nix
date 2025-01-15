{ lib
, stdenv
, buildEnv
, nonRootShadowSetup
, nix2container
, runCommand
, dumb-init
, coreutils
, fetchzip
, cacert
, openapi-merger
}:
let
  name = "openapi-merger";
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
    ];
  };
  swaggerUiVersion = "5.11.0";
  swagger-ui = fetchzip {
    name = "swagger-ui-${swaggerUiVersion}";
    url = "https://github.com/swagger-api/swagger-ui/archive/refs/tags/v${swaggerUiVersion}.zip";
    sha256 = "sha256-e20lv6OUYC+/Qjl9X0Nc4xhoxwlEOOX/6z4yRYwJDWc=";
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
      entrypoint = [ "dumb-init" "--" "${openapi-merger}/bin/${openapi-merger.name}" "run" ];
      user = "${user}:${user}";
    };
  };
in
image
