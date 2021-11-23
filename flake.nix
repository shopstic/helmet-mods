{
  description = "Helmet mods";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/29830319abf5a925921885974faae5509312b940";
    flakeUtils = {
      url = "github:numtide/flake-utils";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    fdbPkgs = {
      url = "github:shopstic/nix-fdb";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flakeUtils.follows = "flakeUtils";
    };
    hotPot = {
      url = "github:shopstic/nix-hot-pot";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flakeUtils.follows = "flakeUtils";
    };
  };

  outputs = { self, nixpkgs, flakeUtils, fdbPkgs, hotPot }:
    flakeUtils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ] (system:
      let
        pkgs = import nixpkgs { inherit system; };
        fdb = fdbPkgs.defaultPackage.${system};
        hotPotPkgs = hotPot.packages.${system};
        src = builtins.path
          {
            path = ./.;
            name = "helmet-mods-src";
            filter = with pkgs.lib; (path: type:
              hasInfix "/src" path ||
              hasSuffix "/cli.sh" path ||
              hasSuffix "/lock.json" path
            );
          };
        deno = hotPotPkgs.deno;
        buildahBuild = pkgs.callPackage hotPot.lib.buildahBuild;
        deps = pkgs.callPackage ./build/deps.nix {
          inherit src deno;
        };
        denoBundle = tsPath: pkgs.callPackage ./build/lib/deno-bundle.nix {
          inherit src tsPath deno deps;
        };
        fdbConfigurator = denoBundle "src/apps/fdb_configurator/fdb_configurator.ts";
        iacVersionBumper = denoBundle "src/apps/iac_version_bumper/iac_version_bumper.ts";
      in
      rec {
        devShell = pkgs.mkShellNoCC {
          buildInputs = builtins.attrValues
            {
              inherit deno;
              inherit (pkgs)
                skopeo
                ;
            };
        };
        devShells = {
          release = pkgs.mkShellNoCC {
            buildInputs = builtins.attrValues
              {
                inherit (pkgs)
                  gh
                  ;
                inherit (hotPotPkgs)
                  manifest-tool
                  ;
              };
          };
        };
        packages = {
          inherit deps fdbConfigurator iacVersionBumper;
        } // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
          fdbServerImage = pkgs.callPackage ./build/fdb-server {
            inherit buildahBuild fdb;
          };
          fdbConfiguratorImage = pkgs.callPackage ./build/fdb-configurator {
            inherit fdbConfigurator buildahBuild fdb deno;
          };
          iacVersionBumperImage = pkgs.callPackage ./build/iac-version-bumper {
            inherit iacVersionBumper buildahBuild deno;
          };
        };
        defaultPackage = pkgs.linkFarmFromDrvs "helmet-mods-all" (pkgs.lib.attrValues packages);
      }
    );
}
