{
  description = "Helmet mods";

  inputs = {
    hotPot.url = "github:shopstic/nix-hot-pot";
    nixpkgs.follows = "hotPot/nixpkgs";
    flakeUtils.follows = "hotPot/flakeUtils";
    fdbPkg.follows = "hotPot/fdbPkg";
    nix2containerPkg.follows = "hotPot/nix2containerPkg";
  };

  outputs = { self, nixpkgs, flakeUtils, fdbPkg, hotPot, nix2containerPkg }:
    flakeUtils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ] (system:
      let
        hotPotPkgs = hotPot.packages.${system};
        hotPotLib = hotPot.lib.${system};
        nix2container = nix2containerPkg.packages.${system}.nix2container;
        pkgs = import nixpkgs {
          inherit system;
        };
        fdb = fdbPkg.packages.${system}.fdb_7;
        src = builtins.path
          {
            path = ./.;
            name = "helmet-mods-src";
            filter = with pkgs.lib; (path: type:
              hasInfix "/src" path ||
              hasSuffix "/deno.json" path ||
              hasSuffix "/deno.lock" path
            );
          };
        cache-entry-file = pkgs.callPackage hotPotLib.denoAppCacheEntry {
          inherit src;
          name = "helmet-mods";
        };
        deno-cache-dir = pkgs.callPackage hotPotLib.denoAppCache {
          inherit cache-entry-file;
          name = "helmet-mods";
          config-file = ./deno.json;
          lock-file = ./deno.lock;
        };
        deno = hotPotPkgs.deno;
        denort = hotPotPkgs.denort;
        denoCompile = tsPath:
          let
            name = pkgs.lib.removeSuffix ".ts" (builtins.baseNameOf tsPath);
            compiled = (pkgs.callPackage hotPotLib.denoAppCompile {
              inherit name deno-cache-dir src;
              appSrcPath = tsPath;
              prefix-patch = ./src/patched_fetch.ts;
              denoCompileFlags = "-A --frozen --no-code-cache";
            }).overrideAttrs (old: {
              __contentAddressed = true;
            });
          in
          compiled;

        fdb-configurator = denoCompile "src/apps/fdb_configurator/fdb_configurator.ts";
        iac-version-bumper = denoCompile "src/apps/iac_version_bumper/iac_version_bumper.ts";
        registry-authenticator = denoCompile "src/apps/registry_authenticator/registry_authenticator.ts";
        registry-syncer = denoCompile "src/apps/registry_syncer/registry_syncer.ts";
        k8s-job-autoscaler = denoCompile "src/apps/k8s_job_autoscaler/k8s_job_autoscaler.ts";
        grafana-syncer = denoCompile "src/apps/grafana_syncer/grafana_syncer.ts";
        github-actions-registry = denoCompile "src/apps/github_actions_registry/github_actions_registry.ts";
        gitlab-cicd-registry = denoCompile "src/apps/gitlab_cicd_registry/gitlab_cicd_registry.ts";
        openapi-merger = denoCompile "src/apps/openapi_merger/openapi_merger.ts";
        tako = denoCompile "src/apps/tako/tako.ts";
        vscode-settings = pkgs.writeTextFile {
          name = "vscode-settings.json";
          text = builtins.toJSON {
            "deno.enable" = true;
            "deno.lint" = true;
            "deno.unstable" = true;
            "deno.path" = deno + "/bin/deno";
            "deno.suggest.imports.hosts" = {
              "https://deno.land" = false;
            };
            # "editor.inlayHints.enabled" = "offUnlessPressed";
            # "deno.inlayHints.enumMemberValues.enabled" = true;
            # "deno.inlayHints.functionLikeReturnTypes.enabled" = true;
            # "deno.inlayHints.parameterNames.enabled" = "all";
            # "deno.inlayHints.parameterNames.suppressWhenArgumentMatchesName" = true;
            # "deno.inlayHints.parameterTypes.enabled" = true;
            # "deno.inlayHints.propertyDeclarationTypes.enabled" = true;
            # "deno.inlayHints.variableTypes.enabled" = true;
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
            "nix.serverSettings" = {
              "nil" = {
                "formatting" = {
                  "command" = [ "nixpkgs-fmt" ];
                };
              };
            };
            "nix.serverPath" = pkgs.nil + "/bin/nil";
          };
        };
      in
      rec {
        devShell = pkgs.mkShellNoCC {
          buildInputs = builtins.attrValues
            {
              inherit deno;
              inherit (pkgs)
                gh
                awscli2
                jq
                parallel
                ;
              inherit (hotPotPkgs)
                manifest-tool
                skopeo-nix2container
                regclient
                typescript-eslint
                openapi-ts-gen
                deno-ship
                ;
            };
          shellHook = ''
            echo 'will cite' | parallel --citation >/dev/null 2>&1
            mkdir -p ./.vscode
            cat ${vscode-settings} > ./.vscode/settings.json
            export DENORT_BIN="${denort}/bin/denort"
            if [[ -f ./.env ]]; then 
              source ./.env
            fi
          '';
        };
        packages = {
          inherit
            deno-cache-dir
            fdb-configurator
            iac-version-bumper
            registry-authenticator
            registry-syncer
            k8s-job-autoscaler
            grafana-syncer
            openapi-merger
            github-actions-registry
            gitlab-cicd-registry
            tako
            ;
        } // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux (
          let
            inherit (hotPotLib) nonRootShadowSetup;
            images = {
              image-fdb-server = pkgs.callPackage ./nix/images/fdb-server {
                inherit nix2container nonRootShadowSetup fdb;
              };
              image-fdb-configurator = pkgs.callPackage ./nix/images/fdb-configurator {
                inherit nonRootShadowSetup nix2container fdb fdb-configurator;
              };
              image-iac-version-bumper = pkgs.callPackage ./nix/images/iac-version-bumper {
                inherit nonRootShadowSetup nix2container iac-version-bumper;
              };
              image-registry-authenticator = pkgs.callPackage ./nix/images/registry-authenticator {
                inherit nonRootShadowSetup nix2container registry-authenticator;
              };
              image-registry-syncer = pkgs.callPackage ./nix/images/registry-syncer {
                inherit nonRootShadowSetup nix2container registry-syncer;
              };
              image-k8s-job-autoscaler = pkgs.callPackage ./nix/images/k8s-job-autoscaler {
                inherit nonRootShadowSetup nix2container k8s-job-autoscaler;
              };
              image-grafana-syncer = pkgs.callPackage ./nix/images/grafana-syncer {
                inherit nonRootShadowSetup nix2container grafana-syncer;
              };
              image-github-actions-registry = pkgs.callPackage ./nix/images/github-actions-registry {
                inherit nonRootShadowSetup nix2container github-actions-registry;
              };
              image-gitlab-cicd-registry = pkgs.callPackage ./nix/images/gitlab-cicd-registry {
                inherit nonRootShadowSetup nix2container gitlab-cicd-registry;
              };
              image-openapi-merger = pkgs.callPackage ./nix/images/openapi-merger {
                inherit nonRootShadowSetup nix2container openapi-merger;
              };
              image-tako = pkgs.callPackage ./nix/images/tako {
                inherit nonRootShadowSetup nix2container tako;
                cloud-init-script = ./src/apps/tako/helper/cloud_init.sh;
              };
            };
          in
          (images // ({
            all-images = pkgs.linkFarmFromDrvs "all-images" (pkgs.lib.attrValues images);
          }))
        );
        defaultPackage = pkgs.linkFarmFromDrvs "helmet-mods"
          (pkgs.lib.unique (builtins.attrValues (pkgs.lib.filterAttrs (n: _: (!(pkgs.lib.hasPrefix "image-" n) && n != "all-images")) packages)));
      }
    );
}
