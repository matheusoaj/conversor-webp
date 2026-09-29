import Foundation

/// Os três atalhos de qualidade que aparecem como botões no app e como
/// variantes da Ação Rápida no Finder.
public enum QualityPreset: String, CaseIterable, Sendable, Codable {
    case alta
    case media
    case leve

    public var quality: Double {
        switch self {
        case .alta: return 90
        case .media: return 82
        case .leve: return 70
        }
    }

    public var title: String {
        switch self {
        case .alta: return "Alta"
        case .media: return "Média"
        case .leve: return "Leve"
        }
    }

    public var subtitle: String {
        switch self {
        case .alta: return "Preserva detalhe fino; ideal para impressão e portfólio."
        case .media: return "O equilíbrio para web e e-commerce. Recomendado."
        case .leve: return "Arquivos bem menores; ótimo para miniaturas e catálogos."
        }
    }

    /// O preset cujo valor bate com `quality`, se houver algum.
    public static func matching(quality: Double) -> QualityPreset? {
        allCases.first { abs($0.quality - quality) < 0.5 }
    }
}

/// O que fazer quando o `.webp` de destino já existe.
public enum ExistingFilePolicy: String, Sendable, Codable {
    /// Pula o arquivo — o padrão, para reconversões em lote saírem baratas.
    case skip
    /// Regrava por cima.
    case overwrite
}

public struct ConversionSettings: Sendable, Codable, Equatable {
    /// 0–100. Valores acima de ~95 crescem muito o arquivo com pouco ganho visível.
    public var quality: Double
    /// Esforço do compressor, 0–6. Mais alto comprime melhor e demora mais.
    public var method: Int
    /// Copia EXIF (data, câmera, GPS) do original para o `.webp`.
    public var preserveMetadata: Bool
    /// Nome da subpasta criada ao lado do original.
    public var outputFolderName: String
    public var existingFilePolicy: ExistingFilePolicy
    /// Quando presente, cada imagem recebe a marca d'água antes da compressão.
    public var watermark: WatermarkSettings?

    public static let defaultOutputFolderName = "webp"

    /// As versões com marca vão para uma pasta própria (`webp-amostra/`): assim
    /// nunca se misturam com as limpas, e uma não é pulada por já existir a outra.
    public static let watermarkFolderSuffix = "-amostra"

    public init(
        quality: Double = QualityPreset.media.quality,
        method: Int = 4,
        preserveMetadata: Bool = true,
        outputFolderName: String = ConversionSettings.defaultOutputFolderName,
        existingFilePolicy: ExistingFilePolicy = .skip,
        watermark: WatermarkSettings? = nil
    ) {
        self.quality = quality
        self.method = method
        self.preserveMetadata = preserveMetadata
        self.outputFolderName = outputFolderName
        self.existingFilePolicy = existingFilePolicy
        self.watermark = watermark
    }

    public var clampedQuality: Float {
        Float(min(100, max(0, quality)))
    }

    public var clampedMethod: Int32 {
        Int32(min(6, max(0, method)))
    }

    /// O nome efetivo da subpasta: `webp`, ou `webp-amostra` quando há marca d'água.
    public var resolvedOutputFolderName: String {
        let folder = outputFolderName.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = folder.isEmpty ? ConversionSettings.defaultOutputFolderName : folder
        return watermark == nil ? base : base + ConversionSettings.watermarkFolderSuffix
    }

    /// A pasta de saída para um arquivo de entrada: `<pasta do original>/webp/`.
    public func outputDirectory(for input: URL) -> URL {
        input.deletingLastPathComponent().appendingPathComponent(resolvedOutputFolderName, isDirectory: true)
    }

    /// O destino final: `<pasta do original>/webp/<nome>.webp`.
    public func outputURL(for input: URL) -> URL {
        outputDirectory(for: input)
            .appendingPathComponent(input.deletingPathExtension().lastPathComponent)
            .appendingPathExtension("webp")
    }
}
