#!/bin/bash
#
# Gera as Ações Rápidas do Finder (bundles .workflow) que chamam a CLI webpify.
#
# Uso: ./Tools/make-quick-actions.sh <diretório de destino>
#
set -euo pipefail

DEST="${1:?informe o diretório de destino}"
mkdir -p "$DEST"

# preset | rótulo no menu do Finder
VARIANTS=(
    "alta|Converter para WebP (Alta)"
    "media|Converter para WebP (Média)"
    "leve|Converter para WebP (Leve)"
)

for variant in "${VARIANTS[@]}"; do
    preset="${variant%%|*}"
    label="${variant##*|}"

    workflow="$DEST/$label.workflow"
    contents="$workflow/Contents"
    rm -rf "$workflow"
    mkdir -p "$contents"

    action_uuid="$(uuidgen)"
    input_uuid="$(uuidgen)"
    output_uuid="$(uuidgen)"

    # O Automator entrega um caminho por linha na entrada padrão. Ler tudo antes
    # de chamar a CLI faz a seleção inteira virar uma única execução — e uma
    # única notificação — mesmo com centenas de arquivos.
    script=$(cat <<'SHELL'
CLI="/Applications/Conversor WebP.app/Contents/MacOS/webpify"
if [ ! -x "$CLI" ]; then
    CLI="$HOME/Applications/Conversor WebP.app/Contents/MacOS/webpify"
fi
if [ ! -x "$CLI" ]; then
    osascript -e 'display alert "Conversor WebP não encontrado" message "Instale o app em /Applications e rode bash install.sh novamente."'
    exit 1
fi

paths=()
while IFS= read -r line; do
    [ -n "$line" ] && paths+=("$line")
done

if [ ${#paths[@]} -eq 0 ]; then
    exit 0
fi

"$CLI" --preset PRESET_PLACEHOLDER --notificar --silencioso "${paths[@]}"
SHELL
)
    script="${script/PRESET_PLACEHOLDER/$preset}"

    # Info.plist: registra a ação no menu de contexto do Finder.
    cat > "$contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSServices</key>
    <array>
        <dict>
            <key>NSMenuItem</key>
            <dict>
                <key>default</key>
                <string>$label</string>
            </dict>
            <key>NSMessage</key>
            <string>runWorkflowAsService</string>
            <key>NSRequiredContext</key>
            <dict>
                <key>NSApplicationIdentifier</key>
                <string>com.apple.finder</string>
            </dict>
            <key>NSSendFileTypes</key>
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

    # document.wflow: o fluxo do Automator com uma única ação "Executar Script do Shell".
    cat > "$contents/document.wflow" <<WFLOW
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>AMApplicationBuild</key>
    <string>521</string>
    <key>AMApplicationVersion</key>
    <string>2.10</string>
    <key>AMDocumentVersion</key>
    <string>2</string>
    <key>actions</key>
    <array>
        <dict>
            <key>action</key>
            <dict>
                <key>AMAccepts</key>
                <dict>
                    <key>Container</key>
                    <string>List</string>
                    <key>Optional</key>
                    <true/>
                    <key>Types</key>
                    <array>
                        <string>com.apple.cocoa.string</string>
                    </array>
                </dict>
                <key>AMActionVersion</key>
                <string>2.0.3</string>
                <key>AMApplication</key>
                <array>
                    <string>Automator</string>
                </array>
                <key>AMParameterProperties</key>
                <dict>
                    <key>COMMAND_STRING</key>
                    <dict/>
                    <key>CheckedForUserDefaultShell</key>
                    <dict/>
                    <key>inputMethod</key>
                    <dict/>
                    <key>shell</key>
                    <dict/>
                    <key>source</key>
                    <dict/>
                </dict>
                <key>AMProvides</key>
                <dict>
                    <key>Container</key>
                    <string>List</string>
                    <key>Types</key>
                    <array>
                        <string>com.apple.cocoa.string</string>
                    </array>
                </dict>
                <key>ActionBundlePath</key>
                <string>/System/Library/Automator/Run Shell Script.action</string>
                <key>ActionName</key>
                <string>Run Shell Script</string>
                <key>ActionParameters</key>
                <dict>
                    <key>COMMAND_STRING</key>
                    <string>$(printf '%s' "$script" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g')</string>
                    <key>CheckedForUserDefaultShell</key>
                    <true/>
                    <key>inputMethod</key>
                    <integer>0</integer>
                    <key>shell</key>
                    <string>/bin/zsh</string>
                    <key>source</key>
                    <string></string>
                </dict>
                <key>BundleIdentifier</key>
                <string>com.apple.RunShellScript</string>
                <key>CFBundleVersion</key>
                <string>2.0.3</string>
                <key>CanShowSelectedItemsWhenRun</key>
                <false/>
                <key>CanShowWhenRun</key>
                <true/>
                <key>Category</key>
                <array>
                    <string>AMCategoryUtilities</string>
                </array>
                <key>Class Name</key>
                <string>RunShellScriptAction</string>
                <key>InputUUID</key>
                <string>$input_uuid</string>
                <key>Keywords</key>
                <array>
                    <string>Shell</string>
                    <string>Script</string>
                    <string>Command</string>
                    <string>Run</string>
                    <string>Unix</string>
                </array>
                <key>OutputUUID</key>
                <string>$output_uuid</string>
                <key>UUID</key>
                <string>$action_uuid</string>
                <key>UnlocalizedApplications</key>
                <array>
                    <string>Automator</string>
                </array>
                <key>arguments</key>
                <dict/>
                <key>isViewVisible</key>
                <integer>1</integer>
                <key>location</key>
                <string>309.000000:253.000000</string>
                <key>nibPath</key>
                <string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
            </dict>
            <key>isViewVisible</key>
            <integer>1</integer>
        </dict>
    </array>
    <key>connectors</key>
    <dict/>
    <key>workflowMetaData</key>
    <dict>
        <key>serviceApplicationBundleID</key>
        <string>com.apple.finder</string>
        <key>serviceApplicationPath</key>
        <string>/System/Library/CoreServices/Finder.app</string>
        <key>serviceInputTypeIdentifier</key>
        <string>com.apple.Automator.fileSystemObject.image</string>
        <key>serviceOutputTypeIdentifier</key>
        <string>com.apple.Automator.nothing</string>
        <key>serviceProcessesInput</key>
        <integer>0</integer>
        <key>workflowTypeIdentifier</key>
        <string>com.apple.Automator.servicesMenu</string>
    </dict>
</dict>
</plist>
WFLOW

    plutil -lint "$contents/Info.plist" > /dev/null
    plutil -lint "$contents/document.wflow" > /dev/null
    echo "  ✓ $label"
done
