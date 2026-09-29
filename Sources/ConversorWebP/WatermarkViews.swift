import SwiftUI
import WebPKit

/// A caixa "Marca d'água de amostra" no painel de opções.
struct WatermarkRow: View {
    @Bindable var model: ConversionModel
    @State private var showsSheet = false

    var body: some View {
        HStack(spacing: 10) {
            Toggle(isOn: enabledBinding) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Marca d'água de amostra")
                    Text(caption)
                        .font(.caption)
                        .foregroundStyle(isMissingImage ? AnyShapeStyle(Color.orange) : AnyShapeStyle(.secondary))
                        .lineLimit(1)
                }
            }
            .toggleStyle(.checkbox)

            Spacer(minLength: 8)

            if model.watermarkEnabled {
                if let image = model.watermarkImage {
                    WatermarkThumbnail(image: image)
                        .frame(width: 52, height: 28)
                    Button("Ajustar…") { showsSheet = true }
                } else {
                    Button("Escolher Imagem…") {
                        if model.chooseWatermark() { showsSheet = true }
                    }
                }
            }
        }
        .sheet(isPresented: $showsSheet) {
            WatermarkSheet(model: model)
        }
    }

    /// Na primeira vez não há imagem guardada: a caixa só fica marcada depois que
    /// uma é escolhida, e a janela de ajuste abre em seguida para a prévia.
    private var enabledBinding: Binding<Bool> {
        Binding(
            get: { model.watermarkEnabled },
            set: { enabled in
                guard enabled, model.watermarkImage == nil else {
                    model.watermarkEnabled = enabled
                    return
                }
                // Fora do ciclo do clique, para o painel modal não rodar no meio da
                // atualização do Toggle.
                Task { @MainActor in
                    if model.chooseWatermark() {
                        model.watermarkEnabled = true
                        showsSheet = true
                    }
                }
            }
        )
    }

    private var isMissingImage: Bool {
        model.watermarkEnabled && model.watermarkImage == nil
    }

    private var caption: String {
        guard model.watermarkEnabled else { return "Aplica sua marca em cada imagem do lote" }
        guard model.watermarkImage != nil else { return "Escolha a imagem da marca para continuar" }
        let scale = Int((model.watermarkScale * 100).rounded())
        let opacity = Int((model.watermarkOpacity * 100).rounded())
        return "\(model.watermarkPlacement.title) · \(scale)% · opacidade \(opacity)%"
    }
}

/// Ajustes da marca com prévia ao vivo sobre as imagens selecionadas.
struct WatermarkSheet: View {
    @Bindable var model: ConversionModel
    @Environment(\.dismiss) private var dismiss

    @State private var preview: PreviewImage?
    @State private var sampleIndex = 0

    private struct PreviewKey: Hashable {
        let style: WatermarkStyle
        let sampleIndex: Int
        let version: Int
    }

    private var previewKey: PreviewKey {
        PreviewKey(style: model.watermarkStyle, sampleIndex: sampleIndex, version: model.watermarkVersion)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 28) {
                previewColumn
                controls
                    .frame(width: 270)
            }
            .padding(24)

            Divider()

            HStack(spacing: 12) {
                Label(
                    "As imagens com marca vão para \(model.settings.resolvedOutputFolderName)/, separadas das versões sem marca.",
                    systemImage: "folder"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)

                Spacer(minLength: 12)

                Button("Pronto") { dismiss() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
        }
        .frame(width: 720)
        .task(id: previewKey) {
            // Arrastar um slider dispara dezenas de mudanças por segundo; esperar
            // um instante faz só a última virar prévia.
            try? await Task.sleep(for: .milliseconds(40))
            guard !Task.isCancelled else { return }
            let rendered = await model.renderWatermarkPreview(sampleIndex: sampleIndex)
            guard !Task.isCancelled else { return }
            preview = rendered
        }
    }

    // MARK: - Prévia

    private var previewColumn: some View {
        VStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.primary.opacity(0.05))
                if let preview {
                    Image(decorative: preview.cgImage, scale: 1)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                        .shadow(color: .black.opacity(0.18), radius: 4, y: 1)
                        .padding(14)
                } else {
                    ProgressView()
                }
            }
            .frame(width: 360, height: 440)

            sampleNavigator
        }
    }

    @ViewBuilder
    private var sampleNavigator: some View {
        let count = model.files.count
        if count > 1 {
            HStack(spacing: 8) {
                Button { move(by: -1) } label: { Image(systemName: "chevron.left") }
                    .disabled(sampleIndex == 0)
                Text("\(sampleIndex + 1) de \(count) · \(sampleName)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .frame(maxWidth: 260)
                Button { move(by: 1) } label: { Image(systemName: "chevron.right") }
                    .disabled(sampleIndex >= count - 1)
            }
            .buttonStyle(.borderless)
        } else if count == 1 {
            Text(sampleName)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
        } else {
            Text("Prévia sobre uma página de exemplo. Adicione imagens para ver a marca sobre elas.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
        }
    }

    private var sampleName: String {
        model.files.indices.contains(sampleIndex) ? model.files[sampleIndex].lastPathComponent : ""
    }

    private func move(by offset: Int) {
        sampleIndex = min(max(0, sampleIndex + offset), max(0, model.files.count - 1))
    }

    // MARK: - Controles

    private var controls: some View {
        VStack(alignment: .leading, spacing: 22) {
            imageSection

            VStack(alignment: .leading, spacing: 8) {
                Text("Posição")
                    .font(.headline)
                Picker("Posição", selection: placementBinding) {
                    ForEach(WatermarkPlacement.allCases, id: \.self) { placement in
                        Text(placement.title).tag(placement)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            percentSlider("Tamanho", value: $model.watermarkScale)
            percentSlider("Opacidade", value: $model.watermarkOpacity)
        }
    }

    private var imageSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Imagem")
                .font(.headline)

            if let image = model.watermarkImage {
                HStack(spacing: 12) {
                    WatermarkThumbnail(image: image)
                        .frame(width: 84, height: 48)

                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(image.width) × \(image.height) px")
                            .font(.caption)
                            .monospacedDigit()
                        if model.watermarkHasTransparency {
                            Label("Fundo transparente", systemImage: "checkmark.circle")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            Label("Sem transparência", systemImage: "exclamationmark.triangle")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                    }
                }

                if !model.watermarkHasTransparency {
                    Text("O fundo da imagem vai aparecer como um retângulo sobre as fotos. Um PNG com fundo transparente fica melhor.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Button("Trocar Imagem…") { model.chooseWatermark() }
        }
    }

    private func percentSlider(_ title: String, value: Binding<Double>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                    .font(.headline)
                Spacer()
                Text("\(Int((value.wrappedValue * 100).rounded()))%")
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Slider(value: value, in: 0.05...1)
        }
    }

    private var placementBinding: Binding<WatermarkPlacement> {
        Binding(
            get: { model.watermarkPlacement },
            set: { model.setWatermarkPlacement($0) }
        )
    }
}

/// Miniatura da marca sobre xadrez, para a transparência ficar visível.
private struct WatermarkThumbnail: View {
    let image: CGImage

    var body: some View {
        Image(decorative: image, scale: 1)
            .resizable()
            .scaledToFit()
            .padding(3)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Checkerboard())
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Color.primary.opacity(0.12)))
    }
}

/// Xadrez em tons médios: tanto marcas brancas quanto pretas aparecem sobre ele.
private struct Checkerboard: View {
    var cell: CGFloat = 6

    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(white: 0.66)))
            let columns = Int((size.width / cell).rounded(.up))
            let rows = Int((size.height / cell).rounded(.up))
            for row in 0..<rows {
                for column in 0..<columns where (row + column).isMultiple(of: 2) {
                    let square = CGRect(x: CGFloat(column) * cell, y: CGFloat(row) * cell, width: cell, height: cell)
                    context.fill(Path(square), with: .color(Color(white: 0.52)))
                }
            }
        }
    }
}
