// A libwebp já vem compilada em Vendor/libwebp/lib; este arquivo existe para dar
// ao SwiftPM uma unidade de compilação no target C e para materializar as macros
// de versão de ABI como símbolos que o Swift consegue chamar.
#include "CWebP.h"

int cwebp_shim_encoder_abi_version(void) {
    return WEBP_ENCODER_ABI_VERSION;
}

int cwebp_shim_mux_abi_version(void) {
    return WEBP_MUX_ABI_VERSION;
}
