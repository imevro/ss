{
  description = "ss — s.solutions: сборка приложения для сервера";

  # Продукт собирает себя сам: по этому же файлу ep-infra берёт ss-app на сервер.
  # bun2nix закреплён ровно тем же набором, что и в ep-infra; при сборке через
  # ep-infra входы nixpkgs и bun2nix подставляются его собственными.
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix = {
      url = "github:nix-community/bun2nix/0f2a1f0b6f42cebe3b149bf62d38754c5e0e9729";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, bun2nix }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in {
      packages.${system}.ss-app = pkgs.callPackage ./default.nix {
        bun2nix = bun2nix.packages.${system}.default;
      };
    };
}
