; Atalhos do menu "Enviar para" do Explorador — o equivalente às Ações Rápidas
; do Finder na versão Mac. Diferente de uma entrada de menu comum, o "Enviar para"
; entrega todos os arquivos selecionados de uma vez, num único processo.

!macro customInstall
  CreateShortCut "$SENDTO\Converter para WebP (Alta).lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--converter --preset alta --notificar --silencioso" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$SENDTO\Converter para WebP (Média).lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--converter --preset media --notificar --silencioso" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$SENDTO\Converter para WebP (Leve).lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--converter --preset leve --notificar --silencioso" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$SENDTO\Converter para WebP (Alta).lnk"
  Delete "$SENDTO\Converter para WebP (Média).lnk"
  Delete "$SENDTO\Converter para WebP (Leve).lnk"
!macroend
