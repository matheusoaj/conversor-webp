import AppKit
import CoreGraphics
import Foundation

// Desenha o ícone do app em 1024×1024 e grava um PNG.
// Uso: swift Tools/MakeIcon/main.swift <saida.png>

let outputPath = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "icon.png"

let size: CGFloat = 1024
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CGContext(
    data: nil,
    width: Int(size),
    height: Int(size),
    bitsPerComponent: 8,
    bytesPerRow: Int(size) * 4,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
)!

func color(_ hex: UInt32, alpha: CGFloat = 1) -> CGColor {
    CGColor(
        red: CGFloat((hex >> 16) & 0xFF) / 255,
        green: CGFloat((hex >> 8) & 0xFF) / 255,
        blue: CGFloat(hex & 0xFF) / 255,
        alpha: alpha
    )
}

// MARK: - Fundo

// Squircle no raio que o macOS usa para ícones de app.
let inset: CGFloat = size * 0.085
let boardRect = CGRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let boardRadius = boardRect.width * 0.2237

let board = CGPath(roundedRect: boardRect, cornerWidth: boardRadius, cornerHeight: boardRadius, transform: nil)

context.saveGState()
context.addPath(board)
context.clip()

let gradient = CGGradient(
    colorsSpace: colorSpace,
    colors: [color(0x3D8BFD), color(0x7A4DE8)] as CFArray,
    locations: [0, 1]
)!
context.drawLinearGradient(
    gradient,
    start: CGPoint(x: boardRect.minX, y: boardRect.maxY),
    end: CGPoint(x: boardRect.maxX, y: boardRect.minY),
    options: []
)

// Brilho suave no topo, para o fundo não ficar chapado.
let sheen = CGGradient(
    colorsSpace: colorSpace,
    colors: [color(0xFFFFFF, alpha: 0.22), color(0xFFFFFF, alpha: 0)] as CFArray,
    locations: [0, 1]
)!
context.drawRadialGradient(
    sheen,
    startCenter: CGPoint(x: size * 0.3, y: size * 0.82),
    startRadius: 0,
    endCenter: CGPoint(x: size * 0.3, y: size * 0.82),
    endRadius: size * 0.55,
    options: []
)
context.restoreGState()

// MARK: - Cartão de foto

let cardWidth = size * 0.50
let cardHeight = size * 0.38
let cardRect = CGRect(
    x: (size - cardWidth) / 2,
    y: size * 0.44,
    width: cardWidth,
    height: cardHeight
)
let cardRadius = size * 0.045

context.saveGState()
context.setShadow(offset: CGSize(width: 0, height: -size * 0.012), blur: size * 0.03,
                  color: color(0x1A1040, alpha: 0.28))
context.setFillColor(color(0xFFFFFF))
context.addPath(CGPath(roundedRect: cardRect, cornerWidth: cardRadius, cornerHeight: cardRadius, transform: nil))
context.fillPath()
context.restoreGState()

// Conteúdo do cartão: sol e duas montanhas, recortados dentro do cartão.
context.saveGState()
context.addPath(CGPath(roundedRect: cardRect, cornerWidth: cardRadius, cornerHeight: cardRadius, transform: nil))
context.clip()

context.setFillColor(color(0xFFC53D))
let sunRadius = cardHeight * 0.13
context.fillEllipse(in: CGRect(
    x: cardRect.minX + cardWidth * 0.20 - sunRadius,
    y: cardRect.minY + cardHeight * 0.72 - sunRadius,
    width: sunRadius * 2,
    height: sunRadius * 2
))

// Montanha de trás
context.setFillColor(color(0x7A4DE8, alpha: 0.45))
context.beginPath()
context.move(to: CGPoint(x: cardRect.minX + cardWidth * 0.34, y: cardRect.minY))
context.addLine(to: CGPoint(x: cardRect.minX + cardWidth * 0.66, y: cardRect.minY + cardHeight * 0.62))
context.addLine(to: CGPoint(x: cardRect.minX + cardWidth * 0.98, y: cardRect.minY))
context.closePath()
context.fillPath()

// Montanha da frente
context.setFillColor(color(0x3D8BFD))
context.beginPath()
context.move(to: CGPoint(x: cardRect.minX - cardWidth * 0.05, y: cardRect.minY))
context.addLine(to: CGPoint(x: cardRect.minX + cardWidth * 0.33, y: cardRect.minY + cardHeight * 0.50))
context.addLine(to: CGPoint(x: cardRect.minX + cardWidth * 0.72, y: cardRect.minY))
context.closePath()
context.fillPath()

context.restoreGState()

// MARK: - Setas de compressão

// Duas setas apontando para o cartão: a ideia de "espremer" o arquivo.
func drawArrow(pointingRight: Bool, centerY: CGFloat) {
    let headSize = size * 0.050
    let shaftLength = size * 0.052
    let thickness = size * 0.030
    let gap = size * 0.032
    let direction: CGFloat = pointingRight ? 1 : -1

    let tipX = pointingRight ? cardRect.minX - gap : cardRect.maxX + gap
    let headBaseX = tipX - direction * headSize
    let shaftEndX = headBaseX - direction * shaftLength

    context.setFillColor(color(0xFFFFFF, alpha: 0.95))

    // Haste, encostando na base da ponta (min/max deixa os dois lados simétricos).
    context.fill(CGRect(
        x: min(headBaseX, shaftEndX),
        y: centerY - thickness / 2,
        width: shaftLength,
        height: thickness
    ))

    // Ponta
    context.beginPath()
    context.move(to: CGPoint(x: tipX, y: centerY))
    context.addLine(to: CGPoint(x: headBaseX, y: centerY + headSize * 0.78))
    context.addLine(to: CGPoint(x: headBaseX, y: centerY - headSize * 0.78))
    context.closePath()
    context.fillPath()
}

let arrowY = cardRect.midY
drawArrow(pointingRight: true, centerY: arrowY)
drawArrow(pointingRight: false, centerY: arrowY)

// MARK: - Etiqueta WEBP

let labelText = "WEBP"
let labelFontSize = size * 0.115
let font = NSFont.systemFont(ofSize: labelFontSize, weight: .heavy)
let attributes: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: NSColor.white,
    .kern: labelFontSize * 0.06,
]
let attributed = NSAttributedString(string: labelText, attributes: attributes)
let textSize = attributed.size()

let graphicsContext = NSGraphicsContext(cgContext: context, flipped: false)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = graphicsContext
attributed.draw(at: CGPoint(
    x: (size - textSize.width) / 2,
    y: size * 0.235
))
NSGraphicsContext.restoreGraphicsState()

// MARK: - Gravação

guard let image = context.makeImage() else {
    print("falha ao renderizar")
    exit(1)
}
let bitmap = NSBitmapImageRep(cgImage: image)
guard let data = bitmap.representation(using: .png, properties: [:]) else {
    print("falha ao gerar PNG")
    exit(1)
}
try data.write(to: URL(fileURLWithPath: outputPath))
print("ícone gravado em \(outputPath)")
