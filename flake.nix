{
  description = "ss — s.solutions: сборка приложения для сервера";

  # Продукт собирает себя сам: по этому файлу ep-infra берёт ss-app на сервер.
  # bun2nix закреплён тем же набором, что и в ep-infra; при сборке через ep-infra
  # входы nixpkgs и bun2nix подставляются его собственными.
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

      # bun 1.3.14 — та же версия, что писала bun.lock. Ставит рабочий набор из
      # замка и кеша bun2nix без сети. 1.3.13 и 1.4.x просят у реестра снимок
      # описания для каждой зависимости рабочего набора, а его в кеше нет и сеть
      # в сборке закрыта.
      bun = pkgs.bun.overrideAttrs (_: {
        version = "1.3.14";
        src = pkgs.fetchzip {
          url = "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-x64.zip";
          hash = "sha256-lR7iruhV8IWVruxiJSJqKY0/6oOj3NZGXAnLzN9+hI8=";
        };
      });
    in {
      packages.${system} = {
        inherit bun;
        ss-app = pkgs.callPackage ./default.nix {
          inherit bun;
          bun2nix = bun2nix.packages.${system}.default;
        };
      };
    };
}
