import SwiftUI

struct DropZoneView: View {
    let model: ConversionModel

    var body: some View {
        VStack(spacing: 22) {
            ZStack {
                Circle()
                    .fill(Color.accentColor.opacity(0.12))
                    .frame(width: 96, height: 96)
                Image(systemName: "photo.on.rectangle.angled")
                    .font(.system(size: 40, weight: .light))
                    .foregroundStyle(Color.accentColor)
            }

            VStack(spacing: 7) {
                Text("Arraste imagens ou pastas aqui")
                    .font(.title3.weight(.medium))
                Text("JPEG · PNG · HEIC — pastas entram inteiras, incluindo subpastas")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            Button("Escolher Arquivos…") {
                model.chooseFiles()
            }
            .controlSize(.large)

            Text("Cada imagem é gravada em \(model.settings.resolvedOutputFolderName)/ ao lado do original.")
                .font(.footnote)
                .foregroundStyle(.tertiary)
                .padding(.top, 4)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
