import AppKit
import SwiftUI

struct FileListView: View {
    let model: ConversionModel

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text(Formatting.imageCount(model.files.count))
                    .font(.headline)
                Text("·")
                    .foregroundStyle(.tertiary)
                Text(Formatting.bytes(model.totalInputBytes))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Spacer()

                Button("Adicionar…") { model.chooseFiles() }
                    .buttonStyle(.link)
                Button("Limpar") { model.clear() }
                    .buttonStyle(.link)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            Divider()

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(model.files, id: \.self) { url in
                        FileRow(url: url) { model.remove(url) }
                        Divider().padding(.leading, 46)
                    }
                }
            }
        }
    }
}

private struct FileRow: View {
    let url: URL
    let onRemove: () -> Void

    @State private var isHovering = false

    var body: some View {
        HStack(spacing: 10) {
            Image(nsImage: NSWorkspace.shared.icon(forFile: url.path))
                .resizable()
                .frame(width: 20, height: 20)

            VStack(alignment: .leading, spacing: 1) {
                Text(url.lastPathComponent)
                    .font(.callout)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text(url.deletingLastPathComponent().path)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
                    .truncationMode(.head)
            }

            Spacer(minLength: 8)

            if isHovering {
                Button {
                    onRemove()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Remover da lista")
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 7)
        .contentShape(Rectangle())
        .background(isHovering ? Color.primary.opacity(0.04) : .clear)
        .onHover { isHovering = $0 }
    }
}
