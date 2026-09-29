import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Recupera o EXIF do arquivo de origem no formato TIFF cru que o chunk `EXIF`
/// do WebP espera.
///
/// Ler as tags com o ImageIO é fácil, mas ele devolve um dicionário — e o WebP
/// quer o bloco binário. Em vez de serializar TIFF na mão, pedimos ao ImageIO
/// que escreva um JPEG de 1×1 carregando esses mesmos metadados e recortamos o
/// segmento APP1 do resultado. Sai barato e o bloco é garantidamente válido.
public enum MetadataExtractor {
    public static func exifBlock(for url: URL) -> Data? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        else { return nil }

        guard let carrier = makeCarrierJPEG(from: properties) else { return nil }
        return extractAPP1Payload(from: carrier)
    }

    /// Monta o JPEG 1×1 que serve só de veículo para os metadados.
    private static func makeCarrierJPEG(from properties: [CFString: Any]) -> Data? {
        var payload: [CFString: Any] = [:]
        for key in [kCGImagePropertyExifDictionary,
                    kCGImagePropertyGPSDictionary,
                    kCGImagePropertyTIFFDictionary,
                    kCGImagePropertyIPTCDictionary,
                    kCGImagePropertyExifAuxDictionary] {
            if let dictionary = properties[key] as? [CFString: Any], !dictionary.isEmpty {
                payload[key] = dictionary
            }
        }
        guard !payload.isEmpty else { return nil }

        // A rotação já foi aplicada aos pixels na decodificação. Deixar a tag
        // original aqui faria o visualizador girar a imagem uma segunda vez.
        payload[kCGImagePropertyOrientation] = 1
        if var tiff = payload[kCGImagePropertyTIFFDictionary] as? [CFString: Any] {
            tiff[kCGImagePropertyTIFFOrientation] = 1
            payload[kCGImagePropertyTIFFDictionary] = tiff
        }
        // As dimensões reais vão no cabeçalho do WebP; as do Exif seriam as do
        // carrier 1×1, então é melhor removê-las do que gravar um valor mentiroso.
        if var exif = payload[kCGImagePropertyExifDictionary] as? [CFString: Any] {
            exif.removeValue(forKey: kCGImagePropertyExifPixelXDimension)
            exif.removeValue(forKey: kCGImagePropertyExifPixelYDimension)
            payload[kCGImagePropertyExifDictionary] = exif
        }

        guard let pixel = onePixelImage() else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output as CFMutableData,
            UTType.jpeg.identifier as CFString,
            1,
            nil
        ) else { return nil }

        CGImageDestinationAddImage(destination, pixel, payload as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }

    private static func onePixelImage() -> CGImage? {
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                  data: nil,
                  width: 1,
                  height: 1,
                  bitsPerComponent: 8,
                  bytesPerRow: 4,
                  space: colorSpace,
                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
              )
        else { return nil }
        return context.makeImage()
    }

    /// Percorre os marcadores do JPEG até o APP1 e devolve o payload TIFF —
    /// isto é, o que vem depois do prefixo "Exif\0\0".
    private static func extractAPP1Payload(from jpeg: Data) -> Data? {
        let exifPrefix: [UInt8] = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
        let bytes = [UInt8](jpeg)
        guard bytes.count > 4, bytes[0] == 0xFF, bytes[1] == 0xD8 else { return nil }

        var index = 2
        while index + 4 <= bytes.count {
            guard bytes[index] == 0xFF else { return nil }
            let marker = bytes[index + 1]
            // Marcadores sem payload.
            if marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7) {
                index += 2
                continue
            }
            // Início do stream comprimido: daqui em diante não há mais metadados.
            if marker == 0xDA || marker == 0xD9 { return nil }

            let length = Int(bytes[index + 2]) << 8 | Int(bytes[index + 3])
            guard length >= 2, index + 2 + length <= bytes.count else { return nil }

            if marker == 0xE1 {
                let segmentStart = index + 4
                let segmentEnd = index + 2 + length
                if segmentEnd - segmentStart > exifPrefix.count,
                   Array(bytes[segmentStart..<(segmentStart + exifPrefix.count)]) == exifPrefix {
                    return Data(bytes[(segmentStart + exifPrefix.count)..<segmentEnd])
                }
            }
            index += 2 + length
        }
        return nil
    }
}
