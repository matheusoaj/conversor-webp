import AppKit
import Foundation
import Observation
import WebPKit

@MainActor
@Observable
final class ConversionModel {
    enum Phase: Equatable {
        case empty
        case ready
        case scanning
        case converting
        case finished
    }

    private(set) var phase: Phase = .empty
    private(set) var files: [URL] = []
    private(set) var totalInputBytes: Int64 = 0
    private(set) var progress: BatchProgress?
    private(set) var summary: BatchSummary?
    /// Erro que impediu o lote de começar — hoje, só uma marca d'água ilegível.
    var batchError: String?

    var quality: Double = Defaults.quality {
        didSet { Defaults.quality = quality }
    }
    var method: Int = Defaults.method {
        didSet { Defaults.method = method }
    }
    var preserveMetadata: Bool = Defaults.preserveMetadata {
        didSet { Defaults.preserveMetadata = preserveMetadata }
    }
    var overwriteExisting: Bool = Defaults.overwriteExisting {
        didSet { Defaults.overwriteExisting = overwriteExisting }
    }
    var outputFolderName: String = Defaults.outputFolderName {
        didSet { Defaults.outputFolderName = outputFolderName }
    }

    // MARK: Marca d'água

    var watermarkEnabled: Bool = Defaults.watermarkEnabled {
        didSet { Defaults.watermarkEnabled = watermarkEnabled }
    }
    var watermarkPlacement: WatermarkPlacement = Defaults.watermarkPlacement {
        didSet { Defaults.watermarkPlacement = watermarkPlacement }
    }
    var watermarkScale: Double = Defaults.watermarkScale {
        didSet { Defaults.watermarkScale = watermarkScale }
    }
    var watermarkOpacity: Double = Defaults.watermarkOpacity {
        didSet { Defaults.watermarkOpacity = watermarkOpacity }
    }

    /// A marca guardada, já decodificada: a prévia a reaproveita a cada ajuste de
    /// slider em vez de reler o arquivo.
    private(set) var watermarkImage: CGImage?
    private(set) var watermarkHasTransparency = true
    /// Muda a cada troca de imagem, para a prévia saber que precisa redesenhar.
    private(set) var watermarkVersion = 0

    private var conversionTask: Task<Void, Never>?
    /// As configurações do último lote, para "Mostrar no Finder" abrir a pasta
    /// certa mesmo que a caixa da marca tenha sido mexida depois.
    private var lastRunSettings: ConversionSettings?

    init() {
        loadStoredWatermark()
    }

    var watermarkStyle: WatermarkStyle {
        WatermarkStyle(placement: watermarkPlacement, scale: watermarkScale, opacity: watermarkOpacity)
    }

    /// A marca só entra quando a caixa está marcada *e* há uma imagem guardada.
    var isWatermarkActive: Bool {
        watermarkEnabled && watermarkImage != nil
    }

    var settings: ConversionSettings {
        ConversionSettings(
            quality: quality,
            method: method,
            preserveMetadata: preserveMetadata,
            outputFolderName: outputFolderName,
            existingFilePolicy: overwriteExisting ? .overwrite : .skip,
            watermark: isWatermarkActive
                ? WatermarkSettings(imageURL: WatermarkStore.imageURL, style: watermarkStyle)
                : nil
        )
    }

    var activePreset: QualityPreset? {
        QualityPreset.matching(quality: quality)
    }

    var canConvert: Bool {
        // Caixa marcada sem imagem disponível: melhor travar do que converter sem
        // a marca que o usuário pediu.
        let watermarkReady = !watermarkEnabled || watermarkImage != nil
        return !files.isEmpty && phase != .converting && phase != .scanning && watermarkReady
    }

    // MARK: - Entrada de arquivos

    /// Varre o que foi solto ou escolhido. A busca roda fora da main actor
    /// porque uma pasta com milhares de itens congelaria a janela.
    func add(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        let existing = files
        let folder = outputFolderName
        phase = .scanning

        Task {
            let discovered = await Task.detached(priority: .userInitiated) {
                FileDiscovery.expand(urls, outputFolderName: folder)
            }.value

            var merged = existing
            var seen = Set(existing.map(\.standardizedFileURL.path))
            for url in discovered where seen.insert(url.standardizedFileURL.path).inserted {
                merged.append(url)
            }

            let bytes = await Task.detached(priority: .userInitiated) { [merged] in
                merged.reduce(Int64(0)) { total, url in
                    let values = try? url.resourceValues(forKeys: [.fileSizeKey])
                    return total + Int64(values?.fileSize ?? 0)
                }
            }.value

            self.files = merged
            self.totalInputBytes = bytes
            self.summary = nil
            self.progress = nil
            self.phase = merged.isEmpty ? .empty : .ready
        }
    }

    func chooseFiles() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = true
        panel.canChooseFiles = true
        panel.allowedContentTypes = ImageDecoder.supportedTypes
        panel.message = "Escolha imagens ou pastas para converter"
        panel.prompt = "Adicionar"

        if panel.runModal() == .OK {
            add(panel.urls)
        }
    }

    func clear() {
        conversionTask?.cancel()
        conversionTask = nil
        files = []
        totalInputBytes = 0
        progress = nil
        summary = nil
        phase = .empty
    }

    func remove(_ url: URL) {
        guard let index = files.firstIndex(of: url) else { return }
        // Subtrai só o arquivo removido: recontar a lista inteira leria o disco
        // uma vez por item, na main actor, a cada clique no "x".
        let values = try? url.resourceValues(forKeys: [.fileSizeKey])
        totalInputBytes = max(0, totalInputBytes - Int64(values?.fileSize ?? 0))
        files.remove(at: index)
        if files.isEmpty { phase = .empty }
    }

    // MARK: - Conversão

    func convert() {
        guard canConvert else { return }
        let inputs = files
        let settings = settings
        lastRunSettings = settings

        phase = .converting
        summary = nil
        batchError = nil
        progress = BatchProgress(
            completed: 0,
            total: inputs.count,
            currentFile: nil,
            originalBytes: 0,
            convertedBytes: 0
        )

        conversionTask = Task {
            do {
                let result = try await BatchConverter.run(inputs: inputs, settings: settings) { update in
                    Task { @MainActor [weak self] in
                        self?.progress = update
                    }
                }
                guard !Task.isCancelled else { return }
                self.summary = result
                self.phase = .finished
            } catch {
                guard !Task.isCancelled else { return }
                self.batchError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                self.progress = nil
                self.phase = .ready
            }
            self.conversionTask = nil
        }
    }

    func cancel() {
        conversionTask?.cancel()
        conversionTask = nil
        phase = files.isEmpty ? .empty : .ready
        progress = nil
    }

    /// Volta ao estado de espera mantendo as opções, para converter outro lote.
    func reset() {
        files = []
        totalInputBytes = 0
        progress = nil
        summary = nil
        phase = .empty
    }

    func revealOutput() {
        guard let first = files.first else { return }
        let directory = (lastRunSettings ?? settings).outputDirectory(for: first)
        NSWorkspace.shared.activateFileViewerSelecting([directory])
    }

    // MARK: - Marca d'água

    /// Trocar de posição volta o tamanho ao sugerido para ela: o tamanho bom para
    /// uma marca única no centro vira uma parede quando repetido.
    func setWatermarkPlacement(_ placement: WatermarkPlacement) {
        guard placement != watermarkPlacement else { return }
        watermarkPlacement = placement
        watermarkScale = placement.defaultScale
    }

    /// Pede a imagem da marca e guarda uma cópia. Devolve `false` se o usuário
    /// cancelou ou a imagem não pôde ser lida.
    @discardableResult
    func chooseWatermark() -> Bool {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.png, .jpeg, .webP, .heic, .tiff]
        panel.message = "Escolha a imagem da marca d'água — de preferência um PNG com fundo transparente"
        panel.prompt = "Usar Esta Imagem"

        guard panel.runModal() == .OK, let url = panel.url else { return false }

        do {
            let image = try WatermarkStore.install(from: url)
            applyWatermarkImage(image)
            return true
        } catch {
            let alert = NSAlert()
            alert.messageText = "Não foi possível usar esta imagem"
            alert.informativeText = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            alert.runModal()
            return false
        }
    }

    /// Renderiza a prévia fora da main actor, com a mesma rotina de desenho do
    /// lote — o que aparece é o que sai.
    func renderWatermarkPreview(sampleIndex: Int) async -> PreviewImage? {
        guard let image = watermarkImage else { return nil }
        let watermark = Watermark(image: image, style: watermarkStyle)
        let sample = files.indices.contains(sampleIndex) ? files[sampleIndex] : nil

        return await Task.detached(priority: .userInitiated) {
            WatermarkPreview.render(sample: sample, watermark: watermark).map(PreviewImage.init)
        }.value
    }

    private func loadStoredWatermark() {
        guard WatermarkStore.hasImage,
              let image = try? Watermark.loadImage(from: WatermarkStore.imageURL)
        else {
            watermarkImage = nil
            return
        }
        applyWatermarkImage(image)
    }

    private func applyWatermarkImage(_ image: CGImage) {
        watermarkImage = image
        watermarkHasTransparency = Watermark.hasTransparency(image)
        watermarkVersion += 1
    }
}

/// `CGImage` é imutável; o invólucro só existe para ele atravessar a fronteira
/// entre a renderização em segundo plano e a interface.
struct PreviewImage: @unchecked Sendable {
    let cgImage: CGImage
}

// MARK: - Preferências

@MainActor
enum Defaults {
    private static var store: UserDefaults { .standard }

    private enum Key {
        static let quality = "quality"
        static let method = "method"
        static let preserveMetadata = "preserveMetadata"
        static let overwriteExisting = "overwriteExisting"
        static let outputFolderName = "outputFolderName"
        static let watermarkEnabled = "watermarkEnabled"
    }

    static var quality: Double {
        get {
            guard store.object(forKey: Key.quality) != nil else { return QualityPreset.media.quality }
            return store.double(forKey: Key.quality)
        }
        set { store.set(newValue, forKey: Key.quality) }
    }

    static var method: Int {
        get {
            guard store.object(forKey: Key.method) != nil else { return 4 }
            return store.integer(forKey: Key.method)
        }
        set { store.set(newValue, forKey: Key.method) }
    }

    static var preserveMetadata: Bool {
        get {
            guard store.object(forKey: Key.preserveMetadata) != nil else { return true }
            return store.bool(forKey: Key.preserveMetadata)
        }
        set { store.set(newValue, forKey: Key.preserveMetadata) }
    }

    static var overwriteExisting: Bool {
        get { store.bool(forKey: Key.overwriteExisting) }
        set { store.set(newValue, forKey: Key.overwriteExisting) }
    }

    static var outputFolderName: String {
        get {
            let stored = store.string(forKey: Key.outputFolderName) ?? ""
            return stored.isEmpty ? ConversionSettings.defaultOutputFolderName : stored
        }
        set { store.set(newValue, forKey: Key.outputFolderName) }
    }

    // As chaves da marca d'água vêm do WebPKit porque a CLI também as lê: é assim
    // que `webpify --amostra` usa os mesmos ajustes feitos aqui.

    static var watermarkEnabled: Bool {
        get { store.bool(forKey: Key.watermarkEnabled) }
        set { store.set(newValue, forKey: Key.watermarkEnabled) }
    }

    static var watermarkPlacement: WatermarkPlacement {
        get {
            store.string(forKey: SharedPreferences.Key.watermarkPlacement)
                .flatMap(WatermarkPlacement.init(rawValue:)) ?? .center
        }
        set { store.set(newValue.rawValue, forKey: SharedPreferences.Key.watermarkPlacement) }
    }

    static var watermarkScale: Double {
        get {
            guard store.object(forKey: SharedPreferences.Key.watermarkScale) != nil else {
                return watermarkPlacement.defaultScale
            }
            return store.double(forKey: SharedPreferences.Key.watermarkScale)
        }
        set { store.set(newValue, forKey: SharedPreferences.Key.watermarkScale) }
    }

    static var watermarkOpacity: Double {
        get {
            guard store.object(forKey: SharedPreferences.Key.watermarkOpacity) != nil else {
                return WatermarkStyle.defaultOpacity
            }
            return store.double(forKey: SharedPreferences.Key.watermarkOpacity)
        }
        set { store.set(newValue, forKey: SharedPreferences.Key.watermarkOpacity) }
    }
}
