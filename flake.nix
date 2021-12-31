{
  description = "Helmet mods";

  inputs = {
    hotPot.url = "github:shopstic/nix-hot-pot";
    nixpkgs.follows = "hotPot/nixpkgs";
    flakeUtils.follows = "hotPot/flakeUtils";
    fdbPkgs.url = "github:shopstic/nix-fdb";
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
        vscodeSettings = pkgs.writeTextFile {
          name = "vscode-settings.json";
          text = builtins.toJSON {
            "deno.enable" = true;
            "deno.lint" = true;
            "deno.unstable" = true;
            "deno.path" = deno + "/bin/deno";
            "deno.suggest.imports.hosts" = {
              "https://deno.land" = false;
            };
            "editor.tabSize" = 2;
            "[typescript]" = {
              "editor.defaultFormatter" = "denoland.vscode-deno";
              "editor.formatOnSave" = true;
            };
            "yaml.schemaStore.enable" = true;
            "yaml.schemas" = {
              "https://json.schemastore.org/github-workflow.json" = ".github/workflows/*.yaml";
              "https://json.schemastore.org/github-action.json" = "*/action.yaml";
            };
            "nix.enableLanguageServer" = true;
            "nix.formatterPath" = pkgs.nixpkgs-fmt + "/bin/nixpkgs-fmt";
            "nix.serverPath" = pkgs.rnix-lsp + "/bin/rnix-lsp";
          };
        };
      in
      rec {
        devShell = pkgs.mkShellNoCC {
          buildInputs = builtins.attrValues
            {
              inherit deno;
              inherit (pkgs)
                skopeo
                gh
                awscli2
                jq
                ;
              inherit (hotPotPkgs)
                manifest-tool
                ;
            };
          shellHook = ''
            mkdir -p ./.vscode
            cat ${vscodeSettings} > ./.vscode/settings.json
          '';
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
            inherit (hotPotPkgs)
              manifest-tool
              ;
          };
        };
        defaultPackage = pkgs.linkFarmFromDrvs "helmet-mods-all" (pkgs.lib.attrValues packages);
      }
    );
}
