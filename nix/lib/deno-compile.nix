{ lib
, stdenv
, runCommand
, deno-deps
, deno
, src
, tsPath
, denoRunFlags ? "--cached-only --unstable -A"
}:
let
  name = lib.removeSuffix ".ts" (builtins.baseNameOf tsPath);
  compiled = stdenv.mkDerivation
    {
      inherit src name;
      nativeBuildInputs = [ deno ];

      phases = [ "unpackPhase" "installPhase" ];

      installPhase =
        ''
          export DENO_DIR=$(mktemp -d)
          echo "DENO_DIR=$DENO_DIR"
          ln -s ${deno-deps}/deps "$DENO_DIR/"
          cp -R ${deno-deps}/gen "$DENO_DIR/"
          chmod -R +w "$DENO_DIR/gen"
          mkdir -p $out/bin
          deno compile --check --lock=lock.json ${denoRunFlags} --output=$out/bin/${name} "${tsPath}" 
        '';
    };
in
compiled

