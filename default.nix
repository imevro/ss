# Сборка приложения для сервера: исходники, node_modules и собранная панель в
# одном неизменяемом каталоге /nix/store. Ставится тем же переключением, что и
# система; откат — одно поколение.
#
# node_modules ставятся из bun.nix (снимок bun.lock, команда scripts/regen-bun-nix),
# без сети. bun2nix.hook копирует кеш в записываемый временный каталог: bun пишет
# внутрь BUN_INSTALL_CACHE_DIR, а каталог в /nix/store только для чтения.
{ stdenvNoCC, bun, bun2nix, nodejs_22 }:

stdenvNoCC.mkDerivation {
  pname = "ss-app";
  version = "0";
  src = ./.;

  nativeBuildInputs = [ bun bun2nix.hook nodejs_22 ];

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ./bun.nix;
    overrides = { };
    useFakeNode = false;
  };

  # Один рабочий набор на корень репозитория (apps/* + packages/*), один bun.lock.
  bunRoot = ".";
  bunInstallFlags = [ "--linker=hoisted" "--frozen-lockfile" "--offline" ];
  dontRunLifecycleScripts = true;
  dontConfigure = true;
  dontFixup = true;

  buildPhase = ''
    runHook preConfigure
    runHook preBuild
    export NODE_ENV=production
    (cd apps/web && bun run build)
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    cp -R . "$out/"
    runHook postInstall
  '';
}
