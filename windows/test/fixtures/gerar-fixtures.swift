// Gera as imagens de teste da versão Windows.
//
// Roda só no macOS (usa o ImageIO), e os arquivos gerados ficam versionados:
// o sharp não grava HEIC, então os testes não conseguem criá-los sozinhos.
//
// Uso: swift test/fixtures/gerar-fixtures.swift test/fixtures

import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let out = URL(fileURLWithPath: CommandLine.arguments[1])
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
let p3 = CGColorSpace(name: CGColorSpace.displayP3)!

/// Degradê azul→laranja com uma faixa vermelha no topo (para conferir a rotação)
/// e um círculo amarelo (para a compressão ter o que fazer).
func scene(width: Int, height: Int, transparent: Bool = false) -> CGImage {
    let alpha: CGImageAlphaInfo = transparent ? .premultipliedLast : .noneSkipLast
    let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                        space: srgb, bitmapInfo: alpha.rawValue)!
    for y in stride(from: 0, to: height, by: 2) {
        let t = Double(y) / Double(height)
        ctx.setFillColor(CGColor(red: t, green: 0.35, blue: 1 - t, alpha: 1))
        ctx.fill(CGRect(x: 0, y: y, width: width, height: 2))
    }
    ctx.setFillColor(CGColor(red: 1, green: 0.9, blue: 0.1, alpha: 1))
    ctx.fillEllipse(in: CGRect(x: width / 6, y: height / 6, width: width / 2, height: height / 2))
    ctx.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
    ctx.fill(CGRect(x: 0, y: height - height / 10, width: width, height: height / 10))
    if transparent {
        // Quadrante inferior esquerdo totalmente transparente.
        ctx.clear(CGRect(x: 0, y: 0, width: width / 2, height: height / 2))
    }
    return ctx.makeImage()!
}

func write(_ image: CGImage, _ name: String, _ type: UTType, _ props: [CFString: Any] = [:]) {
    let url = out.appendingPathComponent(name)
    let dest = CGImageDestinationCreateWithURL(url as CFURL, type.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, image, props as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { fatalError("falha ao gravar \(name)") }
}

let exif: [CFString: Any] = [
    kCGImagePropertyExifDateTimeOriginal: "2024:03:15 14:22:31",
    kCGImagePropertyExifLensModel: "Teste 24-70mm f/2.8",
]
let tiff: [CFString: Any] = [
    kCGImagePropertyTIFFMake: "Fabricante Teste",
    kCGImagePropertyTIFFModel: "Camera Teste X1",
]
let gps: [CFString: Any] = [
    kCGImagePropertyGPSLatitude: 23.5505, kCGImagePropertyGPSLatitudeRef: "S",
    kCGImagePropertyGPSLongitude: 46.6333, kCGImagePropertyGPSLongitudeRef: "W",
]
let metadata: [CFString: Any] = [
    kCGImagePropertyExifDictionary: exif,
    kCGImagePropertyTIFFDictionary: tiff,
    kCGImagePropertyGPSDictionary: gps,
]

let landscape = scene(width: 400, height: 250)

// JPEG com EXIF completo (data, lente, câmera, GPS).
write(landscape, "foto-exif.jpg", .jpeg, metadata.merging([kCGImageDestinationLossyCompressionQuality: 0.9]) { $1 })

// JPEG gravado deitado com a tag "gire 90°" — o caso das fotos de celular.
write(landscape, "foto-girada.jpg", .jpeg, [
    kCGImageDestinationLossyCompressionQuality: 0.9,
    kCGImagePropertyOrientation: 6,
])

// HEIC com EXIF, e HEIC girado.
write(landscape, "foto.heic", .heic, metadata.merging([kCGImageDestinationLossyCompressionQuality: 0.85]) { $1 })
write(landscape, "foto-girada.heic", .heic, [
    kCGImageDestinationLossyCompressionQuality: 0.85,
    kCGImagePropertyOrientation: 6,
])

// PNG com transparência real, e PNG com canal alfa mas totalmente opaco.
write(scene(width: 200, height: 200, transparent: true), "logo-transparente.png", .png)
do {
    let ctx = CGContext(data: nil, width: 300, height: 200, bitsPerComponent: 8, bytesPerRow: 0,
                        space: srgb, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.draw(scene(width: 300, height: 200), in: CGRect(x: 0, y: 0, width: 300, height: 200))
    write(ctx.makeImage()!, "captura-opaca.png", .png)
}

// JPEG em Display P3 com uma cor que muda de número ao virar sRGB. Uma cor
// saturada demais seria recortada para o mesmo valor com ou sem conversão, e o
// teste não provaria nada. O valor esperado vem do ColorSync — a mesma
// conversão que o app Mac faz.
do {
    let color = CGColor(colorSpace: p3, components: [0.25, 0.65, 0.45, 1])!
    let ctx = CGContext(data: nil, width: 120, height: 80, bitsPerComponent: 8, bytesPerRow: 0,
                        space: p3, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(color)
    ctx.fill(CGRect(x: 0, y: 0, width: 120, height: 80))
    let image = ctx.makeImage()!
    write(image, "foto-p3.jpg", .jpeg, [kCGImageDestinationLossyCompressionQuality: 1.0])
    // Fotos de iPhone são HEIC em Display P3: o caso que mais importa.
    write(image, "foto-p3.heic", .heic, [kCGImageDestinationLossyCompressionQuality: 1.0])

    let reference = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                              space: srgb, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    reference.draw(image, in: CGRect(x: 0, y: 0, width: 1, height: 1))
    let px = reference.data!.bindMemory(to: UInt8.self, capacity: 4)
    let json = "{\"r\": \(px[0]), \"g\": \(px[1]), \"b\": \(px[2])}\n"
    try! json.write(to: out.appendingPathComponent("foto-p3.esperado.json"), atomically: true, encoding: .utf8)
}

// Marca d'água transparente ("AMOSTRA" branco com contorno escuro) e uma opaca.
func watermark(transparent: Bool) -> CGImage {
    let w = 350, h = 105
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: srgb,
                        bitmapInfo: (transparent ? CGImageAlphaInfo.premultipliedLast : .noneSkipLast).rawValue)!
    if !transparent {
        ctx.setFillColor(CGColor(red: 0.2, green: 0.2, blue: 0.2, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
    let style = NSMutableParagraphStyle()
    style.alignment = .center
    let font = NSFont.systemFont(ofSize: 64, weight: .black)
    let rect = NSRect(x: 0, y: 12, width: w, height: 80)
    NSAttributedString(string: "AMOSTRA", attributes: [
        .font: font, .paragraphStyle: style, .strokeColor: NSColor(white: 0, alpha: 0.6), .strokeWidth: 10,
    ]).draw(in: rect)
    NSAttributedString(string: "AMOSTRA", attributes: [
        .font: font, .paragraphStyle: style, .foregroundColor: NSColor.white,
    ]).draw(in: rect)
    NSGraphicsContext.restoreGraphicsState()
    return ctx.makeImage()!
}
write(watermark(transparent: true), "marca-teste.png", .png)
write(watermark(transparent: false), "marca-opaca.jpg", .jpeg, [kCGImageDestinationLossyCompressionQuality: 0.9])

// Arquivo corrompido e um que nem é imagem.
try! Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]).write(to: out.appendingPathComponent("quebrado.jpg"))
try! "não sou imagem".write(to: out.appendingPathComponent("leiame.txt"), atomically: true, encoding: .utf8)

print("fixtures gravadas em \(out.path)")
