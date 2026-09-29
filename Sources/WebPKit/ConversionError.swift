import Foundation

public enum ConversionError: LocalizedError, Sendable {
    case unreadableFile(URL)
    case unsupportedFormat(URL)
    case emptyImage
    case colorSpaceUnavailable
    case rasterizationFailed
    case encoderUnavailable
    case invalidQuality(Double)
    case encodingFailed(code: Int32?)
    case outputDirectoryFailed(URL, underlying: String)
    case writeFailed(URL, underlying: String)
    case watermarkUnreadable(URL)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .unreadableFile(let url):
            return "Não foi possível ler \(url.lastPathComponent) — o arquivo pode estar corrompido."
        case .unsupportedFormat(let url):
            return "Formato não suportado: \(url.lastPathComponent)"
        case .emptyImage:
            return "A imagem não tem pixels."
        case .colorSpaceUnavailable:
            return "O espaço de cor sRGB não está disponível no sistema."
        case .rasterizationFailed:
            return "Falha ao preparar o bitmap da imagem."
        case .encoderUnavailable:
            return "O encoder WebP não pôde ser inicializado."
        case .invalidQuality(let value):
            return "Qualidade inválida: \(value). Use um valor entre 0 e 100."
        case .encodingFailed(let code):
            if let code {
                return "A compressão WebP falhou (código \(code))."
            }
            return "A compressão WebP falhou."
        case .outputDirectoryFailed(let url, let underlying):
            return "Não foi possível criar a pasta \(url.path): \(underlying)"
        case .writeFailed(let url, let underlying):
            return "Não foi possível gravar \(url.lastPathComponent): \(underlying)"
        case .watermarkUnreadable(let url):
            return "Não foi possível abrir a marca d'água \(url.lastPathComponent). Use uma imagem PNG, JPEG, WebP ou HEIC."
        case .cancelled:
            return "Conversão cancelada."
        }
    }
}
