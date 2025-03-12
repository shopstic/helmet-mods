{ stdenv
, lib
, nonRootShadowSetup
, runCommand
, buildEnv
, nix2container
, tako
, cacert
, rustscan
, openssh
, bash
, kubectl
, coreutils
, jq
, cloud-init-script
}:
let
  name = tako.name;
  user = tako.name;
  userUid = 1000;
  shadow = nonRootShadowSetup { inherit user; uid = userUid; shellBin = "${bash}/bin/bash"; };
  root-env = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      rustscan
      tako
      openssh
      bash
      kubectl
      coreutils
      jq
    ];
    postBuild = ''
      mkdir -p $out/home/${user}
      cp -R ${shadow}/. $out/
      cp ${cloud-init-script} $out/home/${user}/cloud_init.sh
      chmod +x $out/home/${user}/cloud_init.sh
    '';
  };
  image =
    nix2container.buildImage
      {
        inherit name;
        tag = tako.version;
        copyToRoot = [ root-env ];
        maxLayers = 50;
        perms = [
          {
            path = root-env;
            regex = "/home/${user}";
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
          workingDir = "/home/${user}";
          entrypoint = [ "tako" "run" ];
          cmd = [ ];
          user = "${user}:${user}";
        };
      };
in
image
