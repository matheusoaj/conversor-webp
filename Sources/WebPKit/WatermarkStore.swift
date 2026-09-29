import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Onde fica a marca d'água escolhida no app.
///
/// É uma cópia em PNG num lugar fixo: continua funcionando mesmo se o original
/// for movido ou apagado, e a linha de comando (logo, as Ações Rápidas do Finder)
/// encontra a mesma imagem sem precisar perguntar nada.
public enum WatermarkStore {
    public static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent("Conversor WebP", isDirectory: true)
    }

    public static var imageURL: URL {
        directory.appendingPathComponent("marca-dagua.png")
    }

    public static var hasImage: Bool {
        FileManager.default.fileExists(atPath: imageURL.path)
    }

    /// Valida a imagem e grava a cópia. PNG porque preserva a transparência de
    /// qualquer formato de origem.
    @discardableResult
    public static func install(from source: URL) throws -> CGImage {
        let image = try Watermark.loadImage(from: source)

        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            data as CFMutableData,
            UTType.png.identifier as CFString,
            1,
            nil
        ) else { throw ConversionError.watermarkUnreadable(source) }

        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
            throw ConversionError.watermarkUnreadable(source)
        }

        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try (data as Data).write(to: imageURL, options: .atomic)
        } catch {
            throw ConversionError.writeFailed(imageURL, underlying: error.localizedDescription)
        }
        return image
    }
}

/// Preferências gravadas pelo app que a linha de comando também lê — é assim
/// que uma Ação Rápida aplica a marca com os mesmos ajustes feitos na janela.
public enum SharedPreferences {
    public static let appBundleIdentifier = "com.matheus.conversorwebp"

    public enum Key {
        public static let watermarkPlacement = "watermarkPlacement"
        public static let watermarkScale = "watermarkScale"
        public static let watermarkOpacity = "watermarkOpacity"
    }

    /// O domínio de preferências do app. Dentro do bundle a CLI já compartilha esse
    /// domínio; rodando de fora (em desenvolvimento), pede pelo identificador.
    public static var appDefaults: UserDefaults {
        if Bundle.main.bundleIdentifier == appBundleIdentifier { return .standard }
        return UserDefaults(suiteName: appBundleIdentifier) ?? .standard
    }

    public static func savedWatermarkStyle() -> WatermarkStyle {
        let defaults = appDefaults
        let placement = defaults.string(forKey: Key.watermarkPlacement)
            .flatMap(WatermarkPlacement.init(rawValue:)) ?? .center
        let scale = defaults.object(forKey: Key.watermarkScale) != nil
            ? defaults.double(forKey: Key.watermarkScale)
            : placement.defaultScale
        let opacity = defaults.object(forKey: Key.watermarkOpacity) != nil
            ? defaults.double(forKey: Key.watermarkOpacity)
            : WatermarkStyle.defaultOpacity
        return WatermarkStyle(placement: placement, scale: scale, opacity: opacity)
    }
}

/// A prévia do app: a mesma rotina de desenho do lote, sobre uma miniatura —
/// como o tamanho da marca é proporcional à imagem, o que aparece é o que sai.
public enum WatermarkPreview {
    public static func render(sample: URL?, watermark: Watermark, maxPixelSize: Int = 900) -> CGImage? {
        let base = sample.flatMap { thumbnail(of: $0, maxPixelSize: maxPixelSize) }
        // Sem imagem de exemplo, uma página em proporção A4.
        let width = base?.width ?? Int((Double(maxPixelSize) / 1.414).rounded())
        let height = base?.height ?? maxPixelSize

        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                  data: nil,
                  width: width,
                  height: height,
                  bitsPerComponent: 8,
                  bytesPerRow: 0,
                  space: space,
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              )
        else { return nil }

        let bounds = CGRect(x: 0, y: 0, width: width, height: height)
        context.clear(bounds)
        if let base {
            context.draw(base, in: bounds)
        } else {
            drawPlaceholder(in: context, bounds: bounds, space: space)
        }
        watermark.draw(in: context, width: width, height: height)
        return context.makeImage()
    }

    /// Degradê do claro ao escuro: marcas brancas e pretas aparecem em alguma parte.
    private static func drawPlaceholder(in context: CGContext, bounds: CGRect, space: CGColorSpace) {
        let colors = [CGColor(gray: 0.88, alpha: 1), CGColor(gray: 0.32, alpha: 1)] as CFArray
        guard let gradient = CGGradient(colorsSpace: space, colors: colors, locations: [0, 1]) else {
            context.setFillColor(CGColor(gray: 0.6, alpha: 1))
            context.fill(bounds)
            return
        }
        context.drawLinearGradient(
            gradient,
            start: CGPoint(x: bounds.midX, y: bounds.maxY),
            end: CGPoint(x: bounds.midX, y: bounds.minY),
            options: []
        )
    }

    private static func thumbnail(of url: URL, maxPixelSize: Int) -> CGImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}
