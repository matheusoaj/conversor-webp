import SwiftUI

struct ActionBar: View {
    let model: ConversionModel

    var body: some View {
        HStack(spacing: 12) {
            statusText
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Spacer(minLength: 8)

            switch model.phase {
            case .converting:
                Button("Cancelar") { model.cancel() }
                    .controlSize(.large)
                    .keyboardShortcut(.cancelAction)

            case .finished:
                Button("Mostrar no Finder") { model.revealOutput() }
                    .controlSize(.large)
                Button("Converter Mais") { model.reset() }
                    .controlSize(.large)
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)

            default:
                Button("Converter") { model.convert() }
                    .controlSize(.large)
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!model.canConvert)
            }
        }
    }

    @ViewBuilder
    private var statusText: some View {
        switch model.phase {
        case .empty:
            Text("Nenhuma imagem selecionada")
        case .scanning:
            Text("Procurando imagens…")
        case .ready:
            Text(readySummary)
        case .converting:
            Text("Convertendo…")
        case .finished:
            Text("Concluído")
        }
    }

    private var readySummary: String {
        let count = Formatting.imageCount(model.files.count)
        let mark = model.isWatermarkActive ? " · com marca d'água" : ""
        return "\(count) · qualidade \(Int(model.quality))\(mark) → \(model.settings.resolvedOutputFolderName)/"
    }
}
