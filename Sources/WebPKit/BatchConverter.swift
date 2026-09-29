import Foundation

public struct BatchProgress: Sendable {
    public let completed: Int
    public let total: Int
    public let currentFile: String?
    public let originalBytes: Int64
    public let convertedBytes: Int64

    public init(
        completed: Int,
        total: Int,
        currentFile: String?,
        originalBytes: Int64,
        convertedBytes: Int64
    ) {
        self.completed = completed
        self.total = total
        self.currentFile = currentFile
        self.originalBytes = originalBytes
        self.convertedBytes = convertedBytes
    }

    public var fraction: Double {
        guard total > 0 else { return 0 }
        return Double(completed) / Double(total)
    }
}

public struct BatchFailure: Sendable {
    public let url: URL
    public let message: String
}

public struct BatchSummary: Sendable {
    public var converted: Int = 0
    public var skipped: Int = 0
    public var originalBytes: Int64 = 0
    public var convertedBytes: Int64 = 0
    public var failures: [BatchFailure] = []
    public var wasCancelled: Bool = false

    public var total: Int { converted + skipped + failures.count }
    public var savedBytes: Int64 { max(0, originalBytes - convertedBytes) }

    public var savedFraction: Double {
        guard originalBytes > 0 else { return 0 }
        return Double(savedBytes) / Double(originalBytes)
    }
}

/// Converte uma lista de arquivos usando todos os núcleos disponíveis.
///
/// Os workers puxam de um índice compartilhado em vez de dividir a lista em
/// blocos fixos: as imagens variam muito de tamanho, e um bloco cheio de fotos
/// de 40 MP deixaria os outros núcleos ociosos no fim.
public enum BatchConverter {
    public static func run(
        inputs: [URL],
        settings: ConversionSettings,
        concurrency: Int = ProcessInfo.processInfo.activeProcessorCount,
        onProgress: (@Sendable (BatchProgress) -> Void)? = nil
    ) async throws -> BatchSummary {
        guard !inputs.isEmpty else { return BatchSummary() }

        // A marca d'água é lida uma vez para o lote todo. Se o arquivo não abrir,
        // o lote nem começa: melhor um erro claro do que o mesmo erro por imagem.
        let watermark = try settings.watermark.map(Watermark.init(settings:))

        // Resolver os destinos antes de começar evita que dois arquivos de mesmo
        // nome e extensões diferentes disputem o mesmo .webp.
        let plans = OutputPlanner.plan(for: inputs, settings: settings)
        guard !plans.isEmpty else { return BatchSummary() }

        let state = BatchState(total: plans.count)
        let workers = max(1, min(concurrency, plans.count))

        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<workers {
                group.addTask {
                    while let index = state.nextIndex() {
                        if Task.isCancelled {
                            state.markCancelled()
                            return
                        }
                        let plan = plans[index]
                        do {
                            let result = try ImageConverter.convert(
                                plan.input,
                                to: plan.output,
                                settings: settings,
                                watermark: watermark
                            )
                            state.record(result)
                        } catch {
                            let message = (error as? LocalizedError)?.errorDescription
                                ?? error.localizedDescription
                            state.record(failure: BatchFailure(url: plan.input, message: message))
                        }
                        if let onProgress {
                            onProgress(state.snapshot(currentFile: plan.input.lastPathComponent))
                        }
                    }
                }
            }
        }

        return state.summary()
    }
}

/// Estado mutável compartilhado entre os workers. `NSLock` em vez de um actor
/// porque o trabalho é síncrono e CPU-bound — trocar de executor a cada arquivo
/// custaria mais do que o próprio lock.
private final class BatchState: @unchecked Sendable {
    private let lock = NSLock()
    private let total: Int
    private var cursor = 0
    private var completed = 0
    private var result = BatchSummary()

    init(total: Int) {
        self.total = total
    }

    func nextIndex() -> Int? {
        lock.lock()
        defer { lock.unlock() }
        guard cursor < total else { return nil }
        defer { cursor += 1 }
        return cursor
    }

    func record(_ conversion: ConversionResult) {
        lock.lock()
        defer { lock.unlock() }
        completed += 1
        if conversion.skipped {
            result.skipped += 1
        } else {
            result.converted += 1
            result.originalBytes += conversion.originalBytes
            result.convertedBytes += conversion.convertedBytes
        }
    }

    func record(failure: BatchFailure) {
        lock.lock()
        defer { lock.unlock() }
        completed += 1
        result.failures.append(failure)
    }

    func markCancelled() {
        lock.lock()
        defer { lock.unlock() }
        result.wasCancelled = true
    }

    func snapshot(currentFile: String?) -> BatchProgress {
        lock.lock()
        defer { lock.unlock() }
        return BatchProgress(
            completed: completed,
            total: total,
            currentFile: currentFile,
            originalBytes: result.originalBytes,
            convertedBytes: result.convertedBytes
        )
    }

    func summary() -> BatchSummary {
        lock.lock()
        defer { lock.unlock() }
        return result
    }
}
