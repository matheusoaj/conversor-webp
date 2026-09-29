# libwebp 1.6.0

Bibliotecas estáticas do [libwebp](https://chromium.googlesource.com/webm/libwebp),
do Google, usadas para codificar WebP — o macOS lê WebP, mas não grava.

| Arquivo | Conteúdo |
|---------|----------|
| `lib/libwebp.a` | Codificador e decodificador |
| `lib/libwebpmux.a` | Montagem do contêiner, usada para gravar o EXIF |
| `lib/libsharpyuv.a` | Conversão de cor exigida pelo codificador |

Os cabeçalhos correspondentes ficam em `Sources/CWebP/include/webp/`.

Origem: pacote `webp` 1.6.0 do Homebrew, compilado para **arm64** e **macOS 15**.
Por isso o projeto exige Apple Silicon e macOS 15 ou mais novo. Para gerar
versões para Mac Intel ou macOS mais antigos, veja "Notas de build" no README
principal.

Licença: BSD-style, com concessão adicional de patentes — ver `COPYING`,
`PATENTS` e `AUTHORS` nesta pasta.
