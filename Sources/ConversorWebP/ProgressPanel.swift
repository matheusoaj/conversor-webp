import SwiftUI

struct ProgressPanel: View {
    let model: ConversionModel

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            if let progress = model.progress {
                VStack(spacing: 10) {
                    Text("\(progress.completed) de \(progress.total)")
                        .font(.system(size: 34, weight: .light, design: .rounded))
                        .monospacedDigit()
                        .contentTransition(.numericText())

                    Text(progress.currentFile ?? "Preparando…")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .frame(maxWidth: 420)
                }

                ProgressView(value: progress.fraction)
                    .progressViewStyle(.linear)
                    .frame(maxWidth: 420)
                    .animation(.easeOut(duration: 0.2), value: progress.fraction)

                if progress.convertedBytes > 0 {
                    Text("\(Formatting.bytes(progress.originalBytes)) → \(Formatting.bytes(progress.convertedBytes)) até agora")
                        .font(.footnote)
                        .foregroundStyle(.tertiary)
                        .monospacedDigit()
                }
            } else {
                ProgressView()
            }

            Spacer()
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
