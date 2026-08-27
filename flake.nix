{
  description = "Harustream — self-hosted Next.js streaming app (dev shell + build)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # Node 24 LTS + pnpm pinned to the version declared in package.json
        # (`packageManager: pnpm@11.x`). corepack would otherwise try to
        # download its own pnpm at runtime; the nixpkgs pnpm package is
        # prebuilt, so we use it and skip the download.
        nodejs = pkgs.nodejs_24;
        pnpm = pkgs.pnpm_11;

        # --- dependency fetch cache ---------------------------------------
        # `pnpm fetch` downloads every tarball listed in the lockfile into a
        # content-addressed store dir. Hashing only the lockfile (not src)
        # keeps the cache valid across source-only edits.
        pnpmDeps = pkgs.stdenvNoCC.mkDerivation {
          pname = "harustream-pnpm-fetch";
          version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
          dontUnpack = true;

          nativeBuildInputs = [ pnpm ];

          # pnpm needs a writable HOME and refuses to run as root without it.
          env.HOME = "/tmp";

          buildPhase = ''
            mkdir -p project
            cd project
            cp ${./package.json} package.json
            cp ${./pnpm-lock.yaml} pnpm-lock.yaml
            cp ${./pnpm-workspace.yaml} pnpm-workspace.yaml

            export PNPM_HOME=$PWD/.pnpm-home
            pnpm fetch --ignore-scripts
          '';

          installPhase = ''
            mkdir -p $out
            mv project/node_modules/.pnpm-store $out/store
          '';

          outputHashAlgo = "sha256";
          outputHashMode = "recursive";
          outputHash = pkgs.lib.fakeSha256; # placeholder — replaced after first real build
        };

        # --- production Next.js build --------------------------------------
        harustream = pkgs.stdenvNoCC.mkDerivation {
          pname = "harustream";
          version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
          src = ./.;

          nativeBuildInputs = [ nodejs pnpm pkgs.pnpmConfigHook ];

          # pnpmConfigHook runs `pnpm install --offline` against the fetched
          # store above, so the build never touches the network.
          pnpmDeps = pnpmDeps;

          env.NEXT_TELEMETRY_DISABLED = "1";

          buildPhase = ''
            runHook preBuild
            pnpm exec next build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out
            cp -r ./.next/standalone $out/
            cp -r ./.next/static $out/.next/
            runHook postInstall
          '';

          passthru.updateHashScript = null;
        };
      in
      {
        packages.default = harustream;
        packages.pnpm-deps = pnpmDeps;

        apps.default = flake-utils.lib.mkApp { drv = pkgs.writeShellApplication {
          name = "harustream-help";
          text = ''
            echo "harustream flake targets:"
            echo "  nix develop              # enter dev shell (node24 + pnpm11 + just + biome + wrangler)"
            echo "  nix build                # production Next.js standalone build"
            echo "  nix build .#pnpm-deps    # refresh/fingerprint the dependency cache"
          '';
        }; };

        devShells.default = pkgs.mkShell {
          packages = [
            nodejs
            pnpm
            pkgs.just      # command runner (see justfile)
            pkgs.biome     # matches @biomejs/biome ^2.x used by `pnpm lint`
            pkgs.wrangler  # Cloudflare Workers CLI — deploy src/proxy/ (`npx wrangler` also works)
          ];

          shellHook = ''
            echo "[harustream] node $(node --version) · pnpm $(pnpm --version)"
            echo "[harustream] run 'just help' to list available tasks"
          '';
        };
      });
}
