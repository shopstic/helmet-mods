{ src
, runCommand
, lib
, stdenv
, deno
, unzip
}:
stdenv.mkDerivation
{
  inherit src;
  name = "deno-cache";
  nativeBuildInputs = [ deno unzip ];
  __noChroot = true;
  phases = [ "unpackPhase" "installPhase" ];

  installPhase =
    ''
      mkdir $out
      export DENO_DIR=$out
      patchShebangs ./cli.sh
      ./cli.sh update_cache
      TEMP_DIR=$(mktemp -d)
      touch $TEMP_DIR/noop.ts
      deno compile $TEMP_DIR/noop.ts
    '';
}
