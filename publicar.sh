#!/usr/bin/env bash
# Publica uma nova versão: sobe o versionCode/versionName, compila o APK assinado,
# cria a tag e o release no GitHub com o changelog.
set -euo pipefail

VERSAO="${1:-}"
CHANGELOG="${2:-}"
if [ -z "$VERSAO" ] || [ -z "$CHANGELOG" ]; then
  echo "uso: ./publicar.sh <versao> \"<changelog>\"" >&2
  echo "ex.:  ./publicar.sh 0.2.0 \"- Banner de atualização no jogo\"" >&2
  exit 1
fi

cd "$(dirname "$0")"

GRADLE="app/build.gradle.kts"
CODE_ATUAL=$(grep -E "versionCode = " "$GRADLE" | grep -oE "[0-9]+")
CODE_NOVO=$((CODE_ATUAL + 1))

sed -i '' "s/versionCode = $CODE_ATUAL/versionCode = $CODE_NOVO/" "$GRADLE"
sed -i '' "s/versionName = \".*\"/versionName = \"$VERSAO\"/" "$GRADLE"
echo "versão $VERSAO (código $CODE_NOVO)"

export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 22)}"
./gradlew :app:testDebugUnitTest :app:assembleRelease

git add -A
git commit -m "Versão $VERSAO"
git tag "v$VERSAO"
git push origin HEAD --tags

# O APK é anexado ao release, nunca versionado (fica fora da árvore do git).
TMP="$(mktemp -d)"
APK="$TMP/moto-tv-$VERSAO.apk"
cp app/build/outputs/apk/release/app-release.apk "$APK"
# Dois nomes no release: um versionado (histórico) e um fixo, que dá a URL
# permanente. O app pega o primeiro anexo .apk, então qualquer um serve.
FIXO="$TMP/moto-tv.apk"
cp "$APK" "$FIXO"
# env -u GH_TOKEN: o GH_TOKEN do ambiente devolve 401; o gh usa a própria sessão.
env -u GH_TOKEN gh release create "v$VERSAO" "$APK" "$FIXO" --title "Moto TV $VERSAO" --notes "$CHANGELOG"
rm -rf "$TMP"
echo "release v$VERSAO publicado — o app vai oferecer a atualização"
