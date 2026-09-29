# Conversor WebP

Converte imagens **JPEG, PNG e HEIC** em **WebP** **EM LOTE**, com predefinições de
qualidade e marca d'água opcional. Para **Mac** e **Windows**, com três formas de
uso: janela de arrastar e soltar, clique direito no Finder ou no Explorador, e
linha de comando.

Os arquivos originais nunca são alterados: cada imagem convertida é gravada numa
pasta `webp/` ao lado do original.

**Mac:** macOS 15 ou mais novo, com chip Apple · **Windows:** 10 ou 11, 64 bits · **Licença MIT**

## Recursos

- **Lote de qualquer tamanho** — arraste centenas de imagens ou pastas inteiras
  (subpastas incluídas). Usa todos os núcleos do processador.
- **Qualidade com um clique** — Alta, Média ou Leve, ou qualquer valor de 0 a 100.
- **Marca d'água de amostra** — sua imagem aplicada no centro, repetida pela imagem
  toda ou no canto, com prévia ao vivo.
- **Direto do Finder ou do Explorador** — clique direito → Converter para WebP.
- **Fotos de celular na posição certa** — a rotação é corrigida na conversão.
- **Preserva o que importa** — transparência de PNGs, cores, data, câmera e GPS.

Em fotos típicas, os arquivos ficam cerca de **77% menores** que o JPEG original.

## Como instalar no Mac

Antes de começar, confira em  → **Sobre Este Mac** se o seu Mac tem **chip Apple**
(M1, M2, M3, M4…) e **macOS 15 Sequoia** ou mais novo. Macs com processador Intel
ainda não são suportados.

A instalação compila o app no seu próprio Mac. Parece técnico, mas são quatro
passos de copiar e colar.

**1. Instale as ferramentas da Apple** (só na primeira vez)

Abra o **Terminal** (⌘ + espaço, digite `Terminal`, Enter), cole o comando abaixo e
tecle Enter:

```bash
xcode-select --install
```

Na janela que abrir, clique em **Instalar** e aguarde alguns minutos. Se aparecer
a mensagem de que as ferramentas já estão instaladas, siga para o passo 2. O Xcode
completo **não** é necessário.

**2. Baixe o projeto**

No topo desta página, clique no botão verde **Code** → **Download ZIP**. Abra o
arquivo baixado: vai surgir a pasta `conversor-webp-main` dentro de Downloads.

**3. Instale o app**

No Terminal, cole as duas linhas abaixo e tecle Enter:

```bash
cd ~/Downloads/conversor-webp-main
bash install.sh
```

A primeira compilação leva de 1 a 2 minutos. Se o Mac pedir senha ou disser que não
conseguiu gravar em Aplicativos, use `bash install.sh --usuario` — ele instala na
pasta Aplicativos do seu usuário, sem pedir senha.

**4. Pronto**

Abra o app pelo Spotlight (⌘ + espaço → `Conversor WebP`). A pasta baixada pode
ser apagada.

Se as Ações Rápidas não aparecerem no Finder, clique com o botão direito numa
imagem → **Ações Rápidas** → **Personalizar…** e marque as três opções
"Converter para WebP".

### Atualizar no Mac

Baixe o ZIP novamente e repita o passo 3. Suas preferências e sua marca d'água são
mantidas.

## Como instalar no Windows

Funciona no **Windows 10 e 11, 64 bits**. A instalação monta o instalador no seu
próprio computador: são três passos, e só o primeiro é mais demorado.

**1. Instale o Node.js** (só na primeira vez)

Baixe a versão **LTS** em [nodejs.org](https://nodejs.org) e instale com as opções
padrão — é só ir clicando em **Next** até o fim.

**2. Baixe o projeto**

No topo desta página, clique no botão verde **Code** → **Download ZIP**. Clique com
o botão direito no arquivo baixado → **Extrair Tudo** → **Extrair**.

**3. Instale o app**

Abra a pasta extraída `conversor-webp-main`, entre na pasta **`windows`** e dê dois
cliques em **`instalar.cmd`**.

Como o arquivo veio da internet, o Windows pode pedir confirmação. Se aparecer
**"O Windows protegeu o computador"**, clique em **Mais informações** → **Executar
assim mesmo**. Se aparecer uma pergunta se deseja executar o arquivo, clique em
**Executar**.

Uma janela preta vai baixar as bibliotecas e montar o instalador — na primeira vez
leva alguns minutos e ocupa cerca de 1 GB na pasta. No fim, o instalador abre
sozinho, instala o app e o abre, criando atalhos no Menu Iniciar e na Área de
Trabalho. Depois disso, a pasta baixada pode ser apagada.

### Atualizar no Windows

Baixe o ZIP novamente e repita o passo 3. Suas preferências e sua marca d'água são
mantidas.

## Como usar

**No app** — arraste imagens ou pastas para a janela, escolha a qualidade e clique
em **Converter**. No Mac, também aceita arquivos soltos sobre o ícone na Dock; no
Windows, sobre o atalho do app.

**No Finder (Mac)** — selecione imagens ou pastas, clique com o botão direito →
**Ações Rápidas** → `Converter para WebP (Alta / Média / Leve)`. Uma notificação
avisa quando termina.

**No Explorador (Windows)** — selecione imagens ou pastas, clique com o botão direito
→ **Enviar para** → `Converter para WebP (Alta / Média / Leve)`. No Windows 11, o
"Enviar para" fica em **Mostrar mais opções**. Uma notificação avisa quando termina.

**No Terminal (Mac)** — a ferramenta de linha de comando vem dentro do app. Para
chamá-la só pelo nome, adicione um atalho uma vez:

```bash
echo 'alias webpify="/Applications/Conversor\ WebP.app/Contents/MacOS/webpify"' >> ~/.zshrc
source ~/.zshrc

webpify --preset leve ~/Fotos/catalogo
webpify -q 88 --sobrescrever ~/Downloads/imagem.png
webpify --ajuda
```

**No PowerShell (Windows)** — as mesmas opções:

```powershell
Set-Alias webpify "$env:LOCALAPPDATA\Programs\conversor-webp\resources\bin\webpify.cmd"

webpify --preset leve C:\Fotos\catalogo
webpify --ajuda
```

Para o atalho valer sempre, adicione a linha `Set-Alias` ao seu perfil
(`notepad $PROFILE`).

## Qualidade

| Predefinição | Valor | Quando usar |
|--------------|-------|-------------|
| Alta         | 90    | Impressão, portfólio, detalhe fino |
| Média        | 82    | Web e e-commerce — o equilíbrio padrão |
| Leve         | 70    | Miniaturas, catálogos, arquivos bem menores |

O controle deslizante cobre qualquer valor intermediário, e o último usado fica
salvo. Nas opções avançadas: nome da pasta de saída, esforço do compressor (0–6),
preservar metadados e regravar arquivos já existentes.

## Marca d'água de amostra

Marque **Marca d'água de amostra** no painel de opções. Na primeira vez, o app pede
a imagem da marca — de preferência um **PNG com fundo transparente** — e guarda uma
cópia, então o original pode ser movido ou apagado depois. Em seguida abre a janela
de ajuste, com prévia ao vivo sobre as imagens selecionadas:

| Posição   | Tamanho sugerido | Quando usar |
|-----------|------------------|-------------|
| Centro    | 60%              | Uma marca grande e única no meio da imagem |
| Repetida  | 28%              | Grade cobrindo a imagem inteira — a mais difícil de remover |
| Canto     | 22%              | Assinatura discreta no canto inferior direito |

O tamanho é o percentual da imagem que a marca pode ocupar, sem distorcer, e
funciona igual em retrato e paisagem. Se a sua marca já é uma arte de página
inteira, use **Centro** com tamanho **100%**.

As imagens com marca vão para **`webp-amostra/`**, separadas de `webp/`: versões
limpas e de amostra nunca se misturam.

Na linha de comando:

```bash
webpify --amostra ~/Fotos/catalogo                     # marca e ajustes salvos no app
webpify --marca-dagua ~/logo.png --posicao repetida \
        --tamanho 20 --opacidade 30 ~/Fotos/catalogo     # qualquer arquivo e ajuste
```

## O que é preservado

- **Orientação** — fotos de celular saem com a rotação aplicada nos pixels, sem
  depender de o visualizador respeitar a informação de rotação.
- **Transparência** — PNGs transparentes continuam transparentes. PNGs opacos são
  gravados sem canal de transparência, o que economiza espaço.
- **Cor** — Display P3, Adobe RGB e afins são convertidos para sRGB, o padrão da web.
- **Metadados** — data, câmera, lente e GPS seguem para o WebP (desligável).
- **Datas do arquivo** — a ordem cronológica no Finder não muda.
- **Nomes** — `foto.jpg` e `foto.png` na mesma pasta viram `foto-jpg.webp` e
  `foto-png.webp`, em vez de um sobrescrever o outro.

## Desempenho

120 fotos de 12 MP (90 MB) em **11,5 segundos** num Mac com chip Apple de 8 núcleos,
contra 62 segundos convertendo uma por vez. A marca d'água acrescenta cerca de 10%.

## Para desenvolvedores

### Mac

```
Sources/
  CWebP/            Ponte C para a libwebp (modulemap + shim)
  WebPKit/          Núcleo: decodificação, codificação, metadados, marca d'água, lote paralelo
  ConversorWebP/    App SwiftUI
  webpify/          Linha de comando, usada também pelas Ações Rápidas
Tools/
  MakeIcon/               Desenha o ícone do app em código
  make-quick-actions.sh   Gera as Ações Rápidas do Finder
Vendor/libwebp/     libwebp 1.6.0 estática
build.sh            Compila e monta o .app em build/
install.sh          Compila, instala o app e as Ações Rápidas
```

Não precisa do Xcode: bastam as Command Line Tools. O `build.sh` monta o pacote
`.app` e o assina localmente. A libwebp é incluída no binário, então o app não
depende de nada instalado à parte.

**Mac Intel ou macOS anterior ao 15:** a libwebp em `Vendor/` foi compilada para
chip Apple e macOS 15. Para outros alvos, recompile-a e substitua os arquivos `.a`:

```bash
git clone https://chromium.googlesource.com/webm/libwebp
cd libwebp
cmake -B out -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0 \
             -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" \
             -DWEBP_BUILD_CWEBP=OFF -DWEBP_BUILD_DWEBP=OFF
cmake --build out
cp out/libwebp.a out/libwebpmux.a out/libsharpyuv.a <projeto>/Vendor/libwebp/lib/
```

Depois ajuste `platforms: [.macOS(.v15)]` em `Package.swift` e `MIN_MACOS` em
`build.sh` para a versão escolhida.

### Windows

A versão Windows fica em `windows/`, feita com [Electron](https://www.electronjs.org)
e a biblioteca de imagens [sharp](https://sharp.pixelplumbing.com). O mesmo código
roda no Mac, o que permite desenvolver e testar a versão Windows sem sair dele.

```
windows/
  src/core/       Núcleo: varredura, nomes, conversão, EXIF, HEIC, marca d'água, lote
  src/cli/        Linha de comando webpify, com as mesmas opções da versão Mac
  src/main/       Processo principal do Electron e o "motor" que converte à parte
  src/renderer/   Interface: janela principal e janela da marca d'água
  test/           Testes do núcleo, teste de ponta a ponta e capturas da interface
  build/          Ícone e os atalhos do "Enviar para" (script do instalador NSIS)
  instalar.cmd    Instalação a partir do código, em dois cliques
```

```bash
cd windows
npm install
npm test            # núcleo: conversão, rotação, cores, EXIF, marca d'água, lote
npm run e2e         # abre o app de verdade fora da tela e converte uma pasta
npm run capturas    # fotografa cada estado da interface em capturas/
npm start           # abre o app
npm run instalador  # gera dist/Conversor-WebP-<versão>-Instalador.exe (no Windows)
```

A cada envio, o GitHub Actions compila e testa tudo num Windows real — inclusive
instalar e desinstalar pelo instalador — e guarda as capturas da interface.

## Desinstalar

**Mac:**

```bash
rm -rf "/Applications/Conversor WebP.app"
rm -rf ~/Library/Services/"Converter para WebP"*.workflow
rm -rf ~/Library/Application\ Support/"Conversor WebP"
/System/Library/CoreServices/pbs -flush
```

**Windows:** **Configurações** → **Aplicativos** → **Conversor WebP** → **Desinstalar**.
Os atalhos do "Enviar para" saem junto. As preferências e a marca d'água guardada
ficam em `%APPDATA%\Conversor WebP` — apague essa pasta se quiser remover tudo.

## Licença

[MIT](LICENSE) — use, modifique e distribua à vontade, mantendo o aviso de
copyright.

A versão Mac inclui a [libwebp](https://chromium.googlesource.com/webm/libwebp),
do Google, distribuída sob licença BSD — veja [`Vendor/libwebp/`](Vendor/libwebp/).

A versão Windows usa [Electron](https://www.electronjs.org) (MIT),
[sharp](https://sharp.pixelplumbing.com) (Apache 2.0) com a libvips (LGPL 3.0), e
[heic-decode](https://github.com/catdad-experiments/heic-decode) (ISC) com a libheif
(LGPL 3.0) para ler HEIC. As licenças completas acompanham cada biblioteca na pasta
`node_modules` após a instalação.
