{
  description = "Haru Stream by @harusharu find me on GitHub";

  inputs = {
    nixpkgs.url = "nixpkgs";
    systems.url = "github:nix-systems/default";
    flake-utils = {
      url = "github:numtide/flake-utils";
      inputs.systems.follows = "systems";
    };
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        pname = "harustream";
        version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
        buildInputs = with pkgs; [ nodejs_26 pnpm ];
        nativeBuildInputs = buildInputs;
        # nix run nixpkgs#prefetch-npm-deps -- package-lock.json
        npmDepsHash = pkgs.lib.fakeHash;

      in {
        devShells.default = pkgs.mkShell {
          inherit buildInputs;
          shellHook = ''
            #!/usr/bin/env bash
            export NEXT_TELEMETRY_DISABLED="1"
          '';
        };
        packages.default = pkgs.buildNpmPackage {
          inherit pname version buildInputs npmDepsHash nativeBuildInputs;
          meta = with pkgs.lib; {
            description = "";
            license = licenses.agpl3Only;
            maintainers = [ "harusharu" ];
          };
          src = ./.;
          postInstall = ''
            mkdir -p $out/bin
            exe="$out/bin/${pname}"
            lib="$out/lib/node_modules/${pname}"
            cp -r ./.next $lib
            touch $exe
            chmod +x $exe
            echo "
                #!/usr/bin/env bash
                cd $lib
                ${pkgs.pnpm}/bin/pnpm run start" > $exe
          '';
        };
      });
}
