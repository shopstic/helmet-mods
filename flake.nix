{
  description = "Deno Utils";

  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "x86_64-darwin" "aarch64-darwin" ] (system:
      let pkgs = nixpkgs.legacyPackages.${system}; in
      rec {
        devShell = import ./nix/shell.nix { inherit pkgs; };
        defaultPackage = pkgs.stdenv.mkDerivation {
          name = "helmet-mods-dev";
          version = "1.0.0";
          src = ./.;
          buildInputs = devShell.buildInputs;
          installPhase = "mkdir -p $out";
        };
        packages = {
          devEnv = defaultPackage.inputDerivation;
        };
      }
    );
}
