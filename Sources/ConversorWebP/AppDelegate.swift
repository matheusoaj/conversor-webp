import AppKit

/// Recebe os arquivos que o Finder manda para o app — arrastados sobre o ícone
/// da Dock, ou abertos com "Abrir com".
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    /// Fica pendente até a janela existir: o Finder pode entregar os arquivos
    /// antes da interface estar montada.
    private var pendingURLs: [URL] = []

    var onOpen: (([URL]) -> Void)? {
        didSet {
            guard onOpen != nil, !pendingURLs.isEmpty else { return }
            let urls = pendingURLs
            pendingURLs = []
            onOpen?(urls)
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let onOpen else {
            pendingURLs.append(contentsOf: urls)
            return
        }
        onOpen(urls)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
