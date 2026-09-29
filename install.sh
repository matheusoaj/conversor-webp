#!/bin/bash
#
# Compila, instala o app e ativa as Ações Rápidas no menu de contexto do Finder.
#
#   bash install.sh              instala em /Applications
#   bash install.sh --usuario    instala em ~/Applications (não pede senha)
#
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="Conversor WebP"
SOURCE_APP="build/$APP_NAME.app"
SERVICES_DIR="$HOME/Library/Services"

APPS_DIR="/Applications"
if [ "${1:-}" = "--usuario" ]; then
    APPS_DIR="$HOME/Applications"
fi

# Sempre compila: depois de baixar uma atualização, um build/ antigo seria
# instalado no lugar da versão nova. Sem mudanças, a compilação é incremental.
bash ./build.sh

echo "==> Instalando em $APPS_DIR"
mkdir -p "$APPS_DIR"
TARGET_APP="$APPS_DIR/$APP_NAME.app"

if [ -d "$TARGET_APP" ]; then
    # Encerra uma instância aberta, senão a substituição pega arquivos em uso.
    osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null || true
    sleep 1
    rm -rf "$TARGET_APP"
fi

if ! cp -R "$SOURCE_APP" "$TARGET_APP" 2>/dev/null; then
    echo
    echo "Não consegui gravar em $APPS_DIR."
    echo "Rode novamente com: bash install.sh --usuario   (instala em ~/Applications)"
    exit 1
fi

echo "==> Instalando as Ações Rápidas do Finder"
mkdir -p "$SERVICES_DIR"
bash ./Tools/make-quick-actions.sh "$SERVICES_DIR"

# Faz o macOS reler o catálogo de serviços; sem isso o menu só atualiza depois
# de reiniciar a sessão.
/System/Library/CoreServices/pbs -flush 2>/dev/null || true
/System/Library/CoreServices/pbs -update 2>/dev/null || true

echo
echo "Instalado."
echo
echo "  App:            $TARGET_APP"
echo "  Ações Rápidas:  $SERVICES_DIR"
echo
echo "No Finder: selecione imagens ou pastas → botão direito → Ações Rápidas"
echo "(ou Serviços) → Converter para WebP."
echo
echo "Se as Ações Rápidas não aparecerem, clique com o botão direito numa imagem"
echo "→ Ações Rápidas → Personalizar… e marque as opções \"Converter para WebP\"."
