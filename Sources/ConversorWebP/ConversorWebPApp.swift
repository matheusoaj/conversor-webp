import SwiftUI

@main
struct ConversorWebPApp: App {
    @State private var model = ConversionModel()
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Window("Conversor WebP", id: "principal") {
            ContentView(model: model)
                .frame(minWidth: 520, idealWidth: 560, minHeight: 600, idealHeight: 680)
                .onAppear {
                    appDelegate.onOpen = { urls in model.add(urls) }
                }
        }
        .defaultSize(width: 560, height: 680)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandGroup(after: .newItem) {
                Button("Adicionar Imagens…") { model.chooseFiles() }
                    .keyboardShortcut("o")
                Divider()
                Button("Converter") { model.convert() }
                    .keyboardShortcut(.return, modifiers: .command)
                    .disabled(!model.canConvert)
                Button("Limpar Lista") { model.clear() }
                    .keyboardShortcut(.delete, modifiers: .command)
                    .disabled(model.files.isEmpty)
            }
        }
    }
}
