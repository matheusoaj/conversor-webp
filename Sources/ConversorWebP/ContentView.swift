import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @Bindable var model: ConversionModel
    @State private var isTargeted = false

    var body: some View {
        VStack(spacing: 0) {
            mainArea
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            Divider()

            QualityPicker(model: model)
                .padding(20)
                .background(.regularMaterial)
                .disabled(model.phase == .converting)

            Divider()

            ActionBar(model: model)
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(.regularMaterial)
        }
        // O drop vale para a janela inteira: mirar a área certa com 300 arquivos
        // na mão é um atrito desnecessário.
        .onDrop(of: [.fileURL], isTargeted: $isTargeted) { providers in
            guard model.phase != .converting else { return false }
            Task {
                let urls = await FileDrop.urls(from: providers)
                model.add(urls)
            }
            return true
        }
        .overlay {
            if isTargeted, model.phase != .converting {
                DropHighlight()
            }
        }
        .animation(.easeInOut(duration: 0.18), value: isTargeted)
        .animation(.easeInOut(duration: 0.22), value: model.phase)
        .alert(
            "Não foi possível converter",
            isPresented: Binding(
                get: { model.batchError != nil },
                set: { if !$0 { model.batchError = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.batchError ?? "")
        }
    }

    @ViewBuilder
    private var mainArea: some View {
        switch model.phase {
        case .empty:
            DropZoneView(model: model)
        case .scanning:
            ScanningView()
        case .ready:
            FileListView(model: model)
        case .converting:
            ProgressPanel(model: model)
        case .finished:
            SummaryPanel(model: model)
        }
    }
}

/// Borda de destaque enquanto o cursor arrasta algo sobre a janela.
private struct DropHighlight: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 12)
            .strokeBorder(Color.accentColor, lineWidth: 3)
            .background(Color.accentColor.opacity(0.08))
            .allowsHitTesting(false)
            .ignoresSafeArea()
    }
}

private struct ScanningView: View {
    var body: some View {
        VStack(spacing: 14) {
            ProgressView()
                .controlSize(.large)
            Text("Procurando imagens…")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Converte o que o Finder entrega no drop em URLs de arquivo.
///
/// Sequencial de propósito: `NSItemProvider` não é `Sendable` e a leitura é só
/// do caminho, não do conteúdo — o trabalho pesado vem depois, na varredura.
@MainActor
enum FileDrop {
    static func urls(from providers: [NSItemProvider]) async -> [URL] {
        var result: [URL] = []
        for provider in providers {
            guard provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) else { continue }
            if let url = await load(from: provider) {
                result.append(url)
            }
        }
        return result
    }

    private static func load(from provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            _ = provider.loadObject(ofClass: URL.self) { url, _ in
                continuation.resume(returning: url)
            }
        }
    }
}
