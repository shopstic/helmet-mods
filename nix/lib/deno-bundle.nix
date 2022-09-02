{ lib
, stdenv
, runCommand
, deno-deps
, deno
, src
, tsPath
}:
let
  name = lib.removeSuffix ".ts" (builtins.baseNameOf tsPath);
  jsBundle = stdenv.mkDerivation
    {
      inherit src;
      name = "${name}.js";
      nativeBuildInputs = [ deno ];

      phases = [ "unpackPhase" "installPhase" ];

      installPhase =
        ''
          export DENO_DIR=$(mktemp -d)
          echo "DENO_DIR=$DENO_DIR"
          ln -s ${deno-deps}/deps "$DENO_DIR/"
          cp -R ${deno-deps}/gen "$DENO_DIR/"
          chmod -R +w "$DENO_DIR/gen"
          patchShebangs ./cli.sh
          ./cli.sh bundle_app ${tsPath} $out
        '';
    };
in
jsBundle

