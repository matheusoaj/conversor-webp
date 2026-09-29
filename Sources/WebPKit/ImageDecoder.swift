import Accelerate
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Um bitmap RGBA de 8 bits por canal, em sRGB, com o alfa **não** pré-multiplicado
/// (que é como a libwebp espera receber os pixels).
public struct DecodedImage: @unchecked Sendable {
    public let width: Int
    public let height: Int
    public let bytesPerRow: Int
    public let pixels: UnsafeMutableBufferPointer<UInt8>
    /// `false` quando a imagem é totalmente opaca — aí dá para encodar como RGBX
    /// e poupar o canal alfa no arquivo final.
    public let hasAlpha: Bool

    public func deallocate() {
        pixels.deallocate()
    }
}

public enum ImageDecoder {
    /// Formatos que aceitamos na entrada. HEIC entra por causa das fotos de iPhone.
    public static let supportedTypes: [UTType] = {
        var types: [UTType] = [.jpeg, .png, .heic, .heif]
        if let heics = UTType("public.heics") { types.append(heics) }
        return types
    }()

    public static let supportedExtensions: Set<String> = [
        "jpg", "jpeg", "jpe", "jfif",
        "png",
        "heic", "heif", "heics",
    ]

    public static func isSupported(_ url: URL) -> Bool {
        supportedExtensions.contains(url.pathExtension.lowercased())
    }

    /// - Parameter watermark: desenhada por cima da imagem, no mesmo bitmap, antes
    ///   de a transparência ser analisada — assim uma marca sobre áreas
    ///   transparentes de um PNG entra no cálculo do canal alfa.
    public static func decode(contentsOf url: URL, watermark: Watermark? = nil) throws -> DecodedImage {
        let options: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let source = CGImageSourceCreateWithURL(url as CFURL, options as CFDictionary) else {
            throw ConversionError.unreadableFile(url)
        }
        guard CGImageSourceGetCount(source) > 0 else {
            throw ConversionError.unreadableFile(url)
        }

        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let orientation = (properties?[kCGImagePropertyOrientation] as? UInt32) ?? 1

        guard let cgImage = loadImage(from: source, orientation: orientation, properties: properties) else {
            throw ConversionError.unreadableFile(url)
        }
        return try rasterize(cgImage, watermark: watermark)
    }

    /// Orientação 1 é o caso comum e vai pelo caminho direto. Para os outros sete
    /// valores, pedimos ao ImageIO um "thumbnail" do tamanho original com
    /// `WithTransform`, que é a forma barata de fazer o próprio ImageIO aplicar a
    /// rotação em vez de reimplementarmos a matriz na mão.
    private static func loadImage(
        from source: CGImageSource,
        orientation: UInt32,
        properties: [CFString: Any]?
    ) -> CGImage? {
        guard orientation != 1 else {
            return CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCache: false] as CFDictionary)
        }

        let pixelWidth = (properties?[kCGImagePropertyPixelWidth] as? Int) ?? 0
        let pixelHeight = (properties?[kCGImagePropertyPixelHeight] as? Int) ?? 0
        let maxSide = max(pixelWidth, pixelHeight)

        if maxSide > 0 {
            let thumbOptions: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxSide,
                kCGImageSourceShouldCache: false,
            ]
            if let rotated = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbOptions as CFDictionary) {
                return rotated
            }
        }
        // Sem as dimensões ou se o ImageIO recusar, ainda é melhor entregar a
        // imagem sem girar do que falhar a conversão inteira.
        return CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCache: false] as CFDictionary)
    }

    /// Redesenha em um buffer RGBA sRGB conhecido. Isso normaliza de uma vez
    /// profundidade de bits, layout de canais e perfil de cor (Display P3, Adobe
    /// RGB e afins são convertidos para sRGB aqui).
    private static func rasterize(_ image: CGImage, watermark: Watermark?) throws -> DecodedImage {
        let width = image.width
        let height = image.height
        guard width > 0, height > 0 else { throw ConversionError.emptyImage }

        let bytesPerRow = width * 4
        let byteCount = bytesPerRow * height
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
            throw ConversionError.colorSpaceUnavailable
        }

        let raw = UnsafeMutablePointer<UInt8>.allocate(capacity: byteCount)
        raw.initialize(repeating: 0, count: byteCount)
        var buffer = UnsafeMutableBufferPointer(start: raw, count: byteCount)

        guard let context = CGContext(
            data: raw,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
        ) else {
            raw.deallocate()
            throw ConversionError.rasterizationFailed
        }

        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        watermark?.draw(in: context, width: width, height: height)

        let opaque = isFullyOpaque(buffer)
        if !opaque {
            unpremultiply(&buffer, width: width, height: height, bytesPerRow: bytesPerRow)
        }

        return DecodedImage(
            width: width,
            height: height,
            bytesPerRow: bytesPerRow,
            pixels: buffer,
            hasAlpha: !opaque
        )
    }

    /// Um PNG com canal alfa costuma ser totalmente opaco na prática. Vale a
    /// varredura: descobrir isso deixa o WebP encodar sem plano alfa.
    private static func isFullyOpaque(_ buffer: UnsafeMutableBufferPointer<UInt8>) -> Bool {
        guard let base = buffer.baseAddress else { return true }
        var index = 3
        let count = buffer.count
        while index < count {
            if base[index] != 255 { return false }
            index += 4
        }
        return true
    }

    /// O CGContext só desenha alfa pré-multiplicado; a libwebp quer o contrário.
    private static func unpremultiply(
        _ buffer: inout UnsafeMutableBufferPointer<UInt8>,
        width: Int,
        height: Int,
        bytesPerRow: Int
    ) {
        guard let base = buffer.baseAddress else { return }
        var vBuffer = vImage_Buffer(
            data: base,
            height: vImagePixelCount(height),
            width: vImagePixelCount(width),
            rowBytes: bytesPerRow
        )
        vImageUnpremultiplyData_RGBA8888(&vBuffer, &vBuffer, vImage_Flags(kvImageNoFlags))
    }
}
