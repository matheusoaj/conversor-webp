import CoreGraphics
import Foundation
import ImageIO

/// Onde a marca d'água vai em cada imagem.
public enum WatermarkPlacement: String, CaseIterable, Sendable, Codable, Hashable {
    case center = "centro"
    case tiled = "repetida"
    case corner = "canto"

    public var title: String {
        switch self {
        case .center: return "Centro"
        case .tiled: return "Repetida"
        case .corner: return "Canto"
        }
    }

    /// Tamanho inicial ao trocar de posição: uma marca repetida precisa ser bem
    /// menor que uma única no centro, senão vira uma parede.
    public var defaultScale: Double {
        switch self {
        case .center: return 0.6
        case .tiled: return 0.28
        case .corner: return 0.22
        }
    }
}

/// A aparência da marca, independente de qual imagem ela é.
public struct WatermarkStyle: Sendable, Codable, Hashable {
    public var placement: WatermarkPlacement
    /// Fração das dimensões da imagem que a marca pode ocupar, de 0,05 a 1.
    public var scale: Double
    /// De 0,05 a 1.
    public var opacity: Double

    public static let defaultOpacity = 0.4

    public init(
        placement: WatermarkPlacement = .center,
        scale: Double? = nil,
        opacity: Double = WatermarkStyle.defaultOpacity
    ) {
        self.placement = placement
        self.scale = scale ?? placement.defaultScale
        self.opacity = opacity
    }

    var clampedScale: CGFloat { CGFloat(min(1, max(0.05, scale))) }
    var clampedOpacity: CGFloat { CGFloat(min(1, max(0.05, opacity))) }
}

/// O que o lote precisa saber para aplicar a marca: qual arquivo e como.
public struct WatermarkSettings: Sendable, Codable, Equatable {
    public var imageURL: URL
    public var style: WatermarkStyle

    public init(imageURL: URL, style: WatermarkStyle) {
        self.imageURL = imageURL
        self.style = style
    }
}

/// A marca já carregada, pronta para ser desenhada em quantas imagens for —
/// inclusive em paralelo, por vários núcleos ao mesmo tempo.
public final class Watermark: @unchecked Sendable {
    public let image: CGImage
    public let style: WatermarkStyle

    /// Acima disso só se gasta memória: mesmo numa foto de 12 MP a marca raramente
    /// passa de 3000 px depois de redimensionada.
    public static let maxPixelSize = 3000

    public init(image: CGImage, style: WatermarkStyle) {
        self.image = image
        self.style = style
    }

    public convenience init(settings: WatermarkSettings) throws {
        self.init(image: try Watermark.loadImage(from: settings.imageURL), style: settings.style)
    }

    /// Lê e decodifica a imagem de uma vez, num bitmap sRGB.
    ///
    /// Um `CGImage` vindo direto do ImageIO decodifica sob demanda; com vários
    /// núcleos desenhando a mesma marca ao mesmo tempo, cada um pagaria essa
    /// decodificação de novo. Materializar aqui deixa o desenho barato e seguro
    /// entre threads.
    public static func loadImage(from url: URL) throws -> CGImage {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              CGImageSourceGetCount(source) > 0
        else { throw ConversionError.watermarkUnreadable(url) }

        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard let decoded = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              let bitmap = redraw(decoded)
        else { throw ConversionError.watermarkUnreadable(url) }
        return bitmap
    }

    /// Uma marca sem transparência aparece como um retângulo sobre a foto; o app
    /// usa isto para avisar antes de alguém converter um lote inteiro assim.
    public static func hasTransparency(_ image: CGImage) -> Bool {
        let side = 128
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                  data: nil,
                  width: side,
                  height: side,
                  bitsPerComponent: 8,
                  bytesPerRow: side * 4,
                  space: space,
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ),
              let data = context.data
        else { return true }

        let bounds = CGRect(x: 0, y: 0, width: side, height: side)
        context.clear(bounds)
        context.draw(image, in: bounds)

        let pixels = data.bindMemory(to: UInt8.self, capacity: side * side * 4)
        for index in stride(from: 3, to: side * side * 4, by: 4) where pixels[index] < 250 {
            return true
        }
        return false
    }

    private static func redraw(_ image: CGImage) -> CGImage? {
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                  data: nil,
                  width: image.width,
                  height: image.height,
                  bitsPerComponent: 8,
                  bytesPerRow: 0,
                  space: space,
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              )
        else { return nil }
        let bounds = CGRect(x: 0, y: 0, width: image.width, height: image.height)
        context.clear(bounds)
        context.draw(image, in: bounds)
        return context.makeImage()
    }

    // MARK: - Desenho

    /// Desenha sobre um canvas de `width`×`height` que já contém a imagem.
    public func draw(in context: CGContext, width: Int, height: Int) {
        let canvas = CGSize(width: width, height: height)
        let size = markSize(for: canvas)
        guard size.width >= 1, size.height >= 1 else { return }

        context.saveGState()
        defer { context.restoreGState() }
        context.setAlpha(style.clampedOpacity)
        context.interpolationQuality = .high

        for frame in frames(on: canvas, markSize: size) {
            context.draw(image, in: frame)
        }
    }

    /// A marca cabe numa caixa de `scale` × as dimensões da imagem, sem distorcer —
    /// assim o mesmo tamanho funciona em retrato e em paisagem.
    func markSize(for canvas: CGSize) -> CGSize {
        let aspect = CGFloat(image.width) / CGFloat(max(1, image.height))
        let boxWidth = canvas.width * style.clampedScale
        let boxHeight = canvas.height * style.clampedScale

        var width = boxWidth
        var height = width / aspect
        if height > boxHeight {
            height = boxHeight
            width = height * aspect
        }
        return CGSize(width: width.rounded(), height: height.rounded())
    }

    /// Retângulos onde a marca é desenhada, em coordenadas do CoreGraphics
    /// (origem no canto inferior esquerdo).
    func frames(on canvas: CGSize, markSize size: CGSize) -> [CGRect] {
        switch style.placement {
        case .center:
            return [CGRect(
                x: ((canvas.width - size.width) / 2).rounded(),
                y: ((canvas.height - size.height) / 2).rounded(),
                width: size.width,
                height: size.height
            )]
        case .corner:
            let margin = (min(canvas.width, canvas.height) * 0.03).rounded()
            return [CGRect(
                x: canvas.width - size.width - margin,
                y: margin,
                width: size.width,
                height: size.height
            )]
        case .tiled:
            return tiledFrames(on: canvas, markSize: size)
        }
    }

    /// Grade em tijolinho (linhas alternadas deslocadas meio passo), centrada na
    /// imagem para as bordas saírem simétricas.
    private func tiledFrames(on canvas: CGSize, markSize size: CGSize) -> [CGRect] {
        let gap = max(size.width, size.height) * 0.4
        let stepX = size.width + gap
        let stepY = size.height + gap
        let columns = Int((canvas.width / stepX).rounded(.up)) + 1
        let rows = Int((canvas.height / stepY).rounded(.up)) + 1
        let originX = (canvas.width - size.width) / 2
        let originY = (canvas.height - size.height) / 2
        let bounds = CGRect(origin: .zero, size: canvas)

        var frames: [CGRect] = []
        for row in -rows...rows {
            let shift = row.isMultiple(of: 2) ? 0 : stepX / 2
            for column in -columns...columns {
                let frame = CGRect(
                    x: (originX + CGFloat(column) * stepX + shift).rounded(),
                    y: (originY + CGFloat(row) * stepY).rounded(),
                    width: size.width,
                    height: size.height
                )
                if frame.intersects(bounds) {
                    frames.append(frame)
                }
            }
        }
        return frames
    }
}
