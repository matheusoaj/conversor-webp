import Foundation

/// Um par entrada → destino já resolvido.
public struct ConversionPlan: Sendable {
    public let input: URL
    public let output: URL
}

/// Decide o destino de cada arquivo antes da conversão começar.
///
/// O motivo de existir: `foto.jpg` e `foto.png` na mesma pasta virariam ambos
/// `webp/foto.webp`, e um sobrescreveria o outro. Quando isso acontece, os dois
/// recebem o sufixo da extensão original (`foto-jpg.webp`, `foto-png.webp`) —
/// ninguém "ganha" o nome limpo por acaso de ordenação.
public enum OutputPlanner {
    public static func plan(for inputs: [URL], settings: ConversionSettings) -> [ConversionPlan] {
        // Agrupa por destino pretendido para descobrir onde há disputa.
        var groups: [String: [URL]] = [:]
        var order: [String] = []
        for input in inputs {
            let key = settings.outputURL(for: input).standardizedFileURL.path
            if groups[key] == nil { order.append(key) }
            groups[key, default: []].append(input)
        }

        var plans: [URL: URL] = [:]
        var taken = Set<String>()

        for key in order {
            let contenders = groups[key] ?? []
            guard let first = contenders.first else { continue }

            if contenders.count == 1 {
                plans[first] = settings.outputURL(for: first)
                taken.insert(key)
                continue
            }

            let directory = settings.outputDirectory(for: first)
            for input in contenders {
                let base = input.deletingPathExtension().lastPathComponent
                let suffix = input.pathExtension.lowercased()
                var candidate = directory
                    .appendingPathComponent(suffix.isEmpty ? base : "\(base)-\(suffix)")
                    .appendingPathExtension("webp")

                // Rede de segurança: em disco sensível a maiúsculas, `foto.JPG` e
                // `foto.jpg` chegariam ao mesmo sufixo.
                var counter = 2
                while taken.contains(candidate.standardizedFileURL.path) {
                    candidate = directory
                        .appendingPathComponent("\(base)-\(suffix)-\(counter)")
                        .appendingPathExtension("webp")
                    counter += 1
                }

                taken.insert(candidate.standardizedFileURL.path)
                plans[input] = candidate
            }
        }

        // Preserva a ordem original de entrada.
        return inputs.compactMap { input in
            guard let output = plans[input] else { return nil }
            return ConversionPlan(input: input, output: output)
        }
    }
}
