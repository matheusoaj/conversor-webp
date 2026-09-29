import Foundation

/// Expande o que foi solto na janela (ou selecionado no Finder) na lista real de
/// imagens a converter. Pastas entram recursivamente.
public enum FileDiscovery {
    public static func expand(_ urls: [URL], outputFolderName: String = ConversionSettings.defaultOutputFolderName) -> [URL] {
        var found: [URL] = []
        var seen = Set<String>()

        for url in urls {
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else { continue }

            if isDirectory.boolValue {
                collect(in: url, outputFolderName: outputFolderName, into: &found, seen: &seen)
            } else if ImageDecoder.isSupported(url) {
                let key = url.standardizedFileURL.path
                if seen.insert(key).inserted { found.append(url) }
            }
        }

        return found.sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
    }

    private static func collect(
        in directory: URL,
        outputFolderName: String,
        into found: inout [URL],
        seen: inout Set<String>
    ) {
        let keys: [URLResourceKey] = [.isDirectoryKey, .isRegularFileKey]
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: keys,
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else { return }

        for case let item as URL in enumerator {
            let values = try? item.resourceValues(forKeys: Set(keys))
            if values?.isDirectory == true {
                // Não reprocessa o que já foi convertido antes, com ou sem marca.
                let name = item.lastPathComponent
                if name == outputFolderName || name == outputFolderName + ConversionSettings.watermarkFolderSuffix {
                    enumerator.skipDescendants()
                }
                continue
            }
            guard ImageDecoder.isSupported(item) else { continue }
            let key = item.standardizedFileURL.path
            if seen.insert(key).inserted { found.append(item) }
        }
    }
}
