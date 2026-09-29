// Umbrella header: expõe a libwebp ao Swift como o módulo `CWebP`.
#ifndef CWEBP_UMBRELLA_H
#define CWEBP_UMBRELLA_H

#include "webp/types.h"
#include "webp/encode.h"
#include "webp/decode.h"
#include "webp/mux_types.h"
#include "webp/mux.h"

// As versões de ABI são macros no header; expô-las como funções garante que o
// Swift enxergue exatamente o mesmo número contra o qual a lib foi compilada.
int cwebp_shim_encoder_abi_version(void);
int cwebp_shim_mux_abi_version(void);

#endif /* CWEBP_UMBRELLA_H */
