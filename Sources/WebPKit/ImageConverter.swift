import Foundation

public struct ConversionResult: Sendable {
    public let input: URL
    public let output: URL
    public let originalBytes: Int64
    public let convertedBytes: Int64
    /// `true` quando o `.webp` já existia e a política era pular.
    public let skipped: Bool

    public var savedBytes: Int64 { max(0, originalBytes - convertedBytes) }

    public var savedFraction: Double {
        guard originalBytes > 0 else { return 0 }
        return Double(savedBytes) / Double(originalBytes)
    }
}

public enum ImageConverter {
    /// Converte usando o destino padrão (`webp/<nome>.webp`), carregando a marca
    /// d'água das configurações se houver.
    public static func convert(_ input: URL, settings: ConversionSettings) throws -> ConversionResult {
        let watermark = try settings.watermark.map(Watermark.init(settings:))
        return try convert(input, to: settings.outputURL(for: input), settings: settings, watermark: watermark)
    }

    /// Converte para um destino já resolvido — é o caminho usado pelo lote, onde
    /// o `OutputPlanner` desempata nomes coincidentes antes de começar e a marca
    /// d'água chega carregada uma vez só, em vez de ser relida a cada imagem.
    public static func convert(
        _ input: URL,
        to output: URL,
        settings: ConversionSettings,
        watermark: Watermark?
    ) throws -> ConversionResult {
        guard ImageDecoder.isSupported(input) else {
            throw ConversionError.unsupportedFormat(input)
        }

        let originalBytes = fileSize(of: input)

        if settings.existingFilePolicy == .skip, FileManager.default.fileExists(atPath: output.path) {
            return ConversionResult(
                input: input,
                output: output,
                originalBytes: originalBytes,
                convertedBytes: fileSize(of: output),
                skipped: true
            )
        }

        let directory = output.deletingLastPathComponent()
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            throw ConversionError.outputDirectoryFailed(directory, underlying: error.localizedDescription)
        }

        let decoded = try ImageDecoder.decode(contentsOf: input, watermark: watermark)
        defer { decoded.deallocate() }

        var data = try WebPEncoder.encode(decoded, settings: settings)
        if settings.preserveMetadata, let exif = MetadataExtractor.exifBlock(for: input) {
            data = WebPEncoder.attachingEXIF(exif, to: data)
        }

        do {
            try data.write(to: output, options: .atomic)
        } catch {
            throw ConversionError.writeFailed(output, underlying: error.localizedDescription)
        }

        if settings.preserveMetadata {
            copyTimestamps(from: input, to: output)
        }

        return ConversionResult(
            input: input,
            output: output,
            originalBytes: originalBytes,
            convertedBytes: Int64(data.count),
            skipped: false
        )
    }

    private static func fileSize(of url: URL) -> Int64 {
        let values = try? url.resourceValues(forKeys: [.fileSizeKey])
        return Int64(values?.fileSize ?? 0)
    }

    /// Mantém a foto na mesma posição cronológica das galerias e do Finder.
    private static func copyTimestamps(from input: URL, to output: URL) {
        guard let values = try? input.resourceValues(forKeys: [.creationDateKey, .contentModificationDateKey])
        else { return }
        var attributes: [FileAttributeKey: Any] = [:]
        if let created = values.creationDate { attributes[.creationDate] = created }
        if let modified = values.contentModificationDate { attributes[.modificationDate] = modified }
        guard !attributes.isEmpty else { return }
        try? FileManager.default.setAttributes(attributes, ofItemAtPath: output.path)
    }
}
