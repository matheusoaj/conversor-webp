#!/bin/bash
#
# Compila o projeto e monta "Conversor WebP.app" em build/.
#
# Sem Xcode instalado não há alvo de app pronto: o SwiftPM gera só o executável,
# e este script embrulha esse executável no formato de bundle que o macOS espera.
#
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="Conversor WebP"
BUNDLE_ID="com.matheus.conversorwebp"
VERSION="1.1.0"
BUILD_NUMBER="2"
MIN_MACOS="15.0"

OUT_DIR="build"
APP_DIR="$OUT_DIR/$APP_NAME.app"
CONTENTS="$APP_DIR/Contents"

echo "==> Compilando (release)"
swift build -c release --product ConversorWebP 2>&1 | grep -v "^ld: warning" || true
swift build -c release --product webpify 2>&1 | grep -v "^ld: warning" || true

BIN_DIR="$(swift build -c release --show-bin-path)"
for binary in ConversorWebP webpify; do
    if [ ! -x "$BIN_DIR/$binary" ]; then
        echo "erro: $binary não foi gerado em $BIN_DIR" >&2
        exit 1
    fi
done

echo "==> Montando o bundle"
rm -rf "$APP_DIR"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"

cp "$BIN_DIR/ConversorWebP" "$CONTENTS/MacOS/ConversorWebP"
# A CLI viaja dentro do app: é ela que as Ações Rápidas do Finder executam.
cp "$BIN_DIR/webpify" "$CONTENTS/MacOS/webpify"

echo "==> Gerando o ícone"
ICONSET="$OUT_DIR/AppIcon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
swift Tools/MakeIcon/main.swift "$OUT_DIR/icon-1024.png" > /dev/null

# As oito variantes que o iconutil espera.
sips -z 16 16     "$OUT_DIR/icon-1024.png" --out "$ICONSET/icon_16x16.png"      > /dev/null
sips -z 32 32     "$OUT_DIR/icon-1024.png" --out "$ICONSET/icon_16x16@2x.png"   > /dev/null
sips -z 32 32     "$OUT_DIR/icon-1024.png" --out "$ICONSET/icon_32x32.png"      > /dev/null
sips -z 64 64     "$OUT_DIR/icon-1024.png" --out "$ICONSET/icon_32x32@2x.png"   > /dev/null
sips -z 128 128   "$OUT_DIR/icon-1024.png" --out "$ICONSET/icon_128x128.png"    > /dev/null
sips -z 256 256   "$OUT_DIR/icon-1024.png" --out "$ICONSET/icon_128x128@2x.png" > /dev/null
sips -z 256 256   "$OUT_DIR/icon-1024.png" --out "$ICONSET/icon_256x256.png"    > /dev/null
sips -z 512 512   "$OUT_DIR/icon-1024.png" --out "$ICONSET/icon_256x256@2x.png" > /dev/null
sips -z 512 512   "$OUT_DIR/icon-1024.png" --out "$ICONSET/icon_512x512.png"    > /dev/null
cp "$OUT_DIR/icon-1024.png" "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$CONTENTS/Resources/AppIcon.icns"
rm -rf "$ICONSET"

echo "==> Escrevendo Info.plist"
cat > "$CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>pt_BR</string>
    <key>CFBundleExecutable</key>
    <string>ConversorWebP</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>$BUNDLE_ID</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$APP_NAME</string>
    <key>CFBundleDisplayName</key>
    <string>$APP_NAME</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>$VERSION</string>
    <key>CFBundleVersion</key>
    <string>$BUILD_NUMBER</string>
    <key>LSMinimumSystemVersion</key>
    <string>$MIN_MACOS</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.graphics-design</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>Conversor WebP $VERSION</string>
    <key>CFBundleDocumentTypes</key>
    <array>
        <dict>
            <key>CFBundleTypeName</key>
            <string>Imagem</string>
            <key>CFBundleTypeRole</key>
            <string>Viewer</string>
            <key>LSHandlerRank</key>
            <string>Alternate</string>
            <key>LSItemContentTypes</key>
            <array>
                <string>public.jpeg</string>
                <string>public.png</string>
                <string>public.heic</string>
                <string>public.heif</string>
                <string>public.folder</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
PLIST

printf 'APPL????' > "$CONTENTS/PkgInfo"

echo "==> Assinando (ad-hoc)"
# Sem conta de desenvolvedor, a assinatura ad-hoc é o suficiente para o app
# abrir sem o Gatekeeper reclamar de binário não assinado.
codesign --force --deep --sign - "$APP_DIR" 2>/dev/null

echo
echo "Pronto: $APP_DIR"
echo "Para instalar em /Applications e ativar as Ações Rápidas: bash install.sh"
