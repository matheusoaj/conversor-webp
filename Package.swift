// swift-tools-version: 6.0
import PackageDescription

// Os .a da libwebp vivem em Vendor/ para o build não depender do Homebrew.
// Os caminhos são relativos à raiz do pacote, então sempre compile a partir dela
// (o build.sh cuida disso).
let webpLinkerFlags: [String] = [
    "-LVendor/libwebp/lib",
    "-lwebp",
    "-lwebpmux",
    "-lsharpyuv",
]

let package = Package(
    name: "ConversorWebP",
    // A libwebp em Vendor/ veio do Homebrew, compilada para macOS 15. Para gerar
    // um app que rode em versões anteriores, recompile a libwebp com um
    // MACOSX_DEPLOYMENT_TARGET menor e baixe este valor junto (veja o README).
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "ConversorWebP", targets: ["ConversorWebP"]),
        .executable(name: "webpify", targets: ["webpify"]),
        .library(name: "WebPKit", targets: ["WebPKit"]),
    ],
    targets: [
        .target(
            name: "CWebP",
            linkerSettings: [.unsafeFlags(webpLinkerFlags)]
        ),
        .target(
            name: "WebPKit",
            dependencies: ["CWebP"]
        ),
        .executableTarget(
            name: "webpify",
            dependencies: ["WebPKit"]
        ),
        .executableTarget(
            name: "ConversorWebP",
            dependencies: ["WebPKit"]
        ),
    ]
)
