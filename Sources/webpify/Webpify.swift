import Foundation
import WebPKit

/// Interface de linha de comando do conversor. É ela que as Ações Rápidas do
/// Finder executam.
@main
struct Webpify {
    static let toolName = "webpify"
    static let version = "1.1.0"

    struct Options {
        var settings = ConversionSettings()
        var inputPaths: [String] = []
        var jobs = ProcessInfo.processInfo.activeProcessorCount
        var quiet = false
        var notify = false

        var watermarkPath: String?
        var useSavedWatermark = false
        var placement: WatermarkPlacement?
        var watermarkScale: Double?
        var watermarkOpacity: Double?

        var wantsWatermark: Bool { useSavedWatermark || watermarkPath != nil }
    }

    struct Failure: Error {
        let message: String
    }

    static func main() async {
        var options = parseArguments()

        do {
            options.settings.watermark = try watermarkSettings(for: options)
        } catch {
            abort(message(for: error), notify: options.notify)
        }

        let inputURLs = options.inputPaths.map {
            URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath)
        }
        let files = FileDiscovery.expand(inputURLs, outputFolderName: options.settings.outputFolderName)

        guard !files.isEmpty else {
            abort("nenhuma imagem JPEG, PNG ou HEIC encontrada nos caminhos informados.", notify: options.notify)
        }

        let quiet = options.quiet
        let showsProgress = !quiet && isatty(STDERR_FILENO) == 1

        if !quiet {
            let plural = files.count == 1 ? "imagem" : "imagens"
            let mark = options.settings.watermark == nil ? "" : " e marca d'água"
            writeError("Convertendo \(files.count) \(plural) com qualidade \(Int(options.settings.quality))\(mark)…\n")
        }

        let summary: BatchSummary
        do {
            summary = try await BatchConverter.run(
                inputs: files,
                settings: options.settings,
                concurrency: options.jobs
            ) { progress in
                guard showsProgress else { return }
                let line = "  \(progress.completed)/\(progress.total)  \(progress.currentFile ?? "")"
                writeError("\r\u{1B}[K" + String(line.prefix(110)))
            }
        } catch {
            if showsProgress { writeError("\r\u{1B}[K") }
            abort(message(for: error), notify: options.notify)
        }

        if showsProgress {
            writeError("\r\u{1B}[K")
        }

        let report = summaryLines(summary)
        if !quiet {
            print(report.isEmpty ? "Nada a fazer." : report.joined(separator: " · "))
        }
        for failure in summary.failures {
            writeError("  ✗ \(failure.url.lastPathComponent): \(failure.message)\n")
        }

        if options.notify {
            let title = summary.failures.isEmpty ? "Conversão concluída" : "Conversão concluída com erros"
            showNotification(title: title, body: report.isEmpty ? "Nada a fazer." : report.joined(separator: " · "))
        }

        exit(summary.failures.isEmpty ? 0 : 2)
    }

    // MARK: - Marca d'água

    /// `--amostra` parte da marca e dos ajustes salvos no app; `--marca-dagua`
    /// troca o arquivo. Ajustes passados na linha de comando vencem os salvos.
    static func watermarkSettings(for options: Options) throws -> WatermarkSettings? {
        guard options.wantsWatermark else { return nil }

        var style = options.useSavedWatermark ? SharedPreferences.savedWatermarkStyle() : WatermarkStyle()

        let url: URL
        if let path = options.watermarkPath {
            url = URL(fileURLWithPath: (path as NSString).expandingTildeInPath)
        } else {
            guard WatermarkStore.hasImage else {
                throw Failure(message: "nenhuma marca d'água salva. Abra o Conversor WebP, marque \"Marca d'água de amostra\" e escolha a imagem.")
            }
            url = WatermarkStore.imageURL
        }

        if let placement = options.placement {
            style.placement = placement
            style.scale = placement.defaultScale
        }
        if let scale = options.watermarkScale {
            style.scale = scale / 100
        }
        if let opacity = options.watermarkOpacity {
            style.opacity = opacity / 100
        }
        return WatermarkSettings(imageURL: url, style: style)
    }

    // MARK: - Argumentos

    static func parseArguments() -> Options {
        var options = Options()
        let arguments = Array(CommandLine.arguments.dropFirst())
        var index = 0

        func nextValue(for flag: String) -> String {
            index += 1
            guard index < arguments.count else { fail("a opção \(flag) precisa de um valor.") }
            return arguments[index]
        }

        func percent(for flag: String, label: String) -> Double {
            let raw = nextValue(for: flag)
            guard let value = Double(raw.replacingOccurrences(of: "%", with: "")), (5...100).contains(value) else {
                fail("\(label) inválido(a): \(raw). Use um percentual entre 5 e 100.")
            }
            return value
        }

        while index < arguments.count {
            let argument = arguments[index]
            switch argument {
            case "-h", "--ajuda", "--help":
                printUsage()
                exit(0)
            case "-v", "--versao", "--version":
                print("\(toolName) \(version)")
                exit(0)
            case "-q", "--qualidade", "--quality":
                let raw = nextValue(for: argument)
                guard let value = Double(raw), (0...100).contains(value) else {
                    fail("qualidade inválida: \(raw). Use um número entre 0 e 100.")
                }
                options.settings.quality = value
            case "-p", "--preset":
                let raw = nextValue(for: argument).lowercased()
                let normalized = raw == "média" ? "media" : raw
                guard let preset = QualityPreset(rawValue: normalized) else {
                    fail("preset inválido: \(raw). Use alta, media ou leve.")
                }
                options.settings.quality = preset.quality
            case "-m", "--metodo", "--method":
                let raw = nextValue(for: argument)
                guard let value = Int(raw), (0...6).contains(value) else {
                    fail("método inválido: \(raw). Use um número entre 0 e 6.")
                }
                options.settings.method = value
            case "-j", "--jobs":
                let raw = nextValue(for: argument)
                guard let value = Int(raw), value > 0 else {
                    fail("número de jobs inválido: \(raw).")
                }
                options.jobs = value
            case "--pasta", "--folder":
                options.settings.outputFolderName = nextValue(for: argument)
            case "--sobrescrever", "--overwrite":
                options.settings.existingFilePolicy = .overwrite
            case "--sem-metadados", "--no-metadata":
                options.settings.preserveMetadata = false
            case "--silencioso", "--quiet":
                options.quiet = true
            case "--notificar", "--notify":
                options.notify = true
            case "--amostra", "--sample":
                options.useSavedWatermark = true
            case "--marca-dagua", "--watermark":
                options.watermarkPath = nextValue(for: argument)
            case "--posicao", "--position":
                let raw = nextValue(for: argument)
                let normalized = raw.lowercased().folding(options: .diacriticInsensitive, locale: nil)
                guard let placement = WatermarkPlacement(rawValue: normalized) else {
                    fail("posição inválida: \(raw). Use centro, repetida ou canto.")
                }
                options.placement = placement
            case "--tamanho", "--size":
                options.watermarkScale = percent(for: argument, label: "tamanho")
            case "--opacidade", "--opacity":
                options.watermarkOpacity = percent(for: argument, label: "opacidade")
            default:
                if argument.hasPrefix("-"), argument.count > 1 {
                    fail("opção desconhecida: \(argument)")
                }
                options.inputPaths.append(argument)
            }
            index += 1
        }

        if options.inputPaths.isEmpty {
            printUsage()
            exit(1)
        }
        let tweaksWatermark = options.placement != nil || options.watermarkScale != nil || options.watermarkOpacity != nil
        if tweaksWatermark, !options.wantsWatermark {
            fail("--posicao, --tamanho e --opacidade só valem junto com --amostra ou --marca-dagua.")
        }
        return options
    }

    // MARK: - Saída

    static func summaryLines(_ summary: BatchSummary) -> [String] {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file

        var report: [String] = []
        if summary.converted > 0 {
            let percent = Int((summary.savedFraction * 100).rounded())
            let before = formatter.string(fromByteCount: summary.originalBytes)
            let after = formatter.string(fromByteCount: summary.convertedBytes)
            report.append("\(summary.converted) convertida(s): \(before) → \(after) (−\(percent)%)")
        }
        if summary.skipped > 0 {
            report.append("\(summary.skipped) já existia(m)")
        }
        if !summary.failures.isEmpty {
            report.append("\(summary.failures.count) falhou(aram)")
        }
        return report
    }

    /// Um executável sem bundle não pode registrar em `UserNotifications`, então
    /// o caminho prático para avisar o usuário é pedir ao osascript.
    static func showNotification(title: String, body: String) {
        let script = "display notification \(escaped(body)) with title \(escaped(title))"
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        try? process.run()
        process.waitUntilExit()
    }

    static func escaped(_ text: String) -> String {
        let body = text
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        return "\"\(body)\""
    }

    static func message(for error: Error) -> String {
        if let failure = error as? Failure { return failure.message }
        return (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }

    static func writeError(_ text: String) {
        FileHandle.standardError.write(Data(text.utf8))
    }

    /// Falha avisando também por notificação: vindo de uma Ação Rápida, não há
    /// terminal onde a mensagem de erro apareça.
    static func abort(_ message: String, notify: Bool) -> Never {
        if notify {
            showNotification(title: "Conversão não realizada", body: message)
        }
        fail(message)
    }

    static func fail(_ message: String) -> Never {
        writeError("\(toolName): \(message)\n")
        exit(1)
    }

    static func printUsage() {
        print("""
        \(toolName) \(version) — converte JPEG, PNG e HEIC em WebP.

        USO
          \(toolName) [opções] <arquivo ou pasta> ...

        Pastas são percorridas recursivamente. Cada imagem é gravada em
        <pasta do original>/webp/<nome>.webp — ou em webp-amostra/ quando
        leva marca d'água.

        OPÇÕES
          -q, --qualidade <0-100>   Qualidade da compressão (padrão: 82)
          -p, --preset <nome>       alta (90), media (82) ou leve (70)
          -m, --metodo <0-6>        Esforço do compressor (padrão: 4)
          -j, --jobs <n>            Conversões simultâneas (padrão: núcleos da CPU)
              --pasta <nome>        Nome da subpasta de saída (padrão: webp)
              --sobrescrever        Regrava arquivos .webp já existentes
              --sem-metadados       Não copia o EXIF do original
              --silencioso          Só imprime erros
              --notificar           Exibe uma notificação do macOS ao terminar
          -h, --ajuda               Mostra esta ajuda
          -v, --versao              Mostra a versão

        MARCA D'ÁGUA
              --amostra             Usa a marca e os ajustes salvos no app
              --marca-dagua <arq>   Usa outra imagem como marca (PNG transparente)
              --posicao <nome>      centro, repetida ou canto
              --tamanho <5-100>     Percentual da imagem ocupado pela marca
              --opacidade <5-100>   Percentual de opacidade (padrão: 40)

        EXEMPLOS
          \(toolName) ~/Fotos/produto.jpg
          \(toolName) --preset leve ~/Fotos/catalogo
          \(toolName) --amostra ~/Fotos/catalogo
          \(toolName) --marca-dagua ~/logo.png --posicao repetida --opacidade 25 ~/Fotos
        """)
    }
}
