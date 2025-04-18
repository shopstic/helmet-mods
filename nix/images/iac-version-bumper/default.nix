{ lib
, stdenv
, buildEnv
, nonRootShadowSetup
, writeShellScript
, runCommand
, nix2container
, dumb-init
, cacert
, gitMinimal
, regclient
, openssh
, bash
, coreutils
, iac-version-bumper
}:
let
  name = "iac-version-bumper";
  entrypoint = writeShellScript "entrypoint.sh" ''
    set -euo pipefail

    COMMITTER_NAME=''${COMMITTER_NAME:?"COMMITTER_NAME env variable is required"}
    COMMITTER_EMAIL=''${COMMITTER_EMAIL:?"COMMITTER_EMAIL env variable is required"}
  
    cat << EOF > $HOME/.gitconfig
    [user]
        name = ''${COMMITTER_NAME}
        email = ''${COMMITTER_EMAIL}
    EOF

    exec "${iac-version-bumper}/bin/${iac-version-bumper.name}" auto-bump-versions "$@"
  '';
  user = "app";
  userUid = 1001;
  shadow = nonRootShadowSetup { inherit user; uid = userUid; shellBin = "${bash}/bin/bash"; };
  dirs = runCommand "sdir" { } ''
    mkdir -p $out/home/${user}
    mkdir -p $out/tmp
  '';
  nix-bin = buildEnv {
    name = "nix-bin";
    pathsToLink = [ "/bin" ];
    paths = [
      bash
      coreutils
      dumb-init
      gitMinimal
      regclient.regctl
      openssh
    ];
  };
  image = nix2container.buildImage {
    inherit name;
    tag = iac-version-bumper.version;
    copyToRoot = [ nix-bin shadow dirs ];
    maxLayers = 80;
    perms = [
      {
        path = dirs;
        regex = "/home/${user}$";
        mode = "0755";
        gid = userUid;
        uid = userUid;
      }
      {
        path = dirs;
        regex = "/tmp$";
        mode = "0755";
        gid = userUid;
        uid = userUid;
      }
    ];
    config = {
      entrypoint = [ "dumb-init" "--" entrypoint ];
      user = "${user}:${user}";
      workingdir = "/home/${user}";
      env = [
        "PATH=/bin"
        "SSL_CERT_FILE=${cacert}/etc/ssl/certs/ca-bundle.crt"
      ];
    };
  };
in
image

