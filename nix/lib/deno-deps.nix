{ src
, runCommand
, lib
, stdenv
, deno
}:
stdenv.mkDerivation
{
  inherit src;
  name = "deno-cache";
  nativeBuildInputs = [ deno ];
  __noChroot = true;
  phases = [ "unpackPhase" "installPhase" ];

  installPhase =
    ''
      mkdir $out
      export DENO_DIR=$out
      patchShebangs ./cli.sh
      ./cli.sh update_cache
    '';
}
