{ pkgs }:
let
  deno = pkgs.callPackage ./deno-bin.nix { };
in
pkgs.mkShell {
  buildInputs = builtins.attrValues
    {
      inherit (pkgs)
        buildkit
        ;
    } ++ [
    deno
  ];
}
