{
  description = "Helmet mods";

  inputs = {
    hotPot.url = "github:shopstic/nix-hot-pot";
    nixpkgs.follows = "hotPot/nixpkgs";
    flakeUtils.follows = "hotPot/flakeUtils";
    fdbPkgs.url = "github:shopstic/nix-fdb/6.3.23";
  };

  outputs = { self, nixpkgs, flakeUtils, fdbPkgs, hotPot }:
    flakeUtils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ] (system:
      let
        hotPotPkgs = hotPot.packages.${system};
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            (final: prev: {
              regclient = hotPotPkgs.regclient;
            })
          ];
        };
        fdb = fdbPkgs.defaultPackage.${system};
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
        registryAuthenticator = denoBundle "src/apps/registry_authenticator/registry_authenticator.ts";
        registrySyncer = denoBundle "src/apps/registry_syncer/registry_syncer.ts";
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
                regclient
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
          };
          registryAuthenticatorImage = pkgs.callPackage ./build/registry-authenticator {
            inherit registryAuthenticator buildahBuild deno;
          };
          registrySyncerImage = pkgs.callPackage ./build/registry-syncer {
            inherit registrySyncer buildahBuild deno;
          };
        };
        defaultPackage = pkgs.linkFarmFromDrvs "helmet-mods-all" (pkgs.lib.attrValues packages);
      }
    );
}
