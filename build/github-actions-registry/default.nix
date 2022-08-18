{ lib
, stdenv
, deno
, dumb-init
, writeTextDir
, runCommand
, bash
, dockerTools
, githubActionsRegistry
}:
let
  name = "github-actions-registry";
  uid = 1001;
  gid = 1001;
  user = "app";
in
dockerTools.buildLayeredImage {
  name = name;
  contents = [ dumb-init deno bash ];
  config = {
    Entrypoint = [ "dumb-init" "--" "deno" "run" "--cached-only" "-A" githubActionsRegistry "run" ];
    User = "app:app";
  };
  fakeRootCommands = ''
    mkdir ./etc

    echo "root:!x:::::::" > ./etc/shadow
    echo "${user}:!:::::::" >> ./etc/shadow

    echo "root:x:0:0::/root:${bash}/bin/bash" > ./etc/passwd
    echo "${user}:x:${toString uid}:${toString gid}::/home/${user}:" >> ./etc/passwd

    echo "root:x:0:" > ./etc/group
    echo "${user}:x:${toString gid}:" >> ./etc/group

    echo "root:x::" > ./etc/gshadow
    echo "${user}:x::" >> ./etc/gshadow

    mkdir -p ./home/${user}
    chown ${toString uid} ./home/${user}
  '';
}

