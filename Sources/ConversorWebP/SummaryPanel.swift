import SwiftUI
import WebPKit

struct SummaryPanel: View {
    let model: ConversionModel
    @State private var showsFailures = false

    var body: some View {
        if let summary = model.summary {
            ScrollView {
                VStack(spacing: 20) {
                    header(summary)

                    if summary.converted > 0 {
                        savingsCard(summary)
                    }

                    if summary.skipped > 0 {
                        Label(
                            "\(summary.skipped) já tinham .webp e foram puladas. Ligue \"Regravar\" nas opções avançadas para refazê-las.",
                            systemImage: "arrow.turn.down.right"
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: 420, alignment: .leading)
                    }

                    if !summary.failures.isEmpty {
                        failuresSection(summary)
                    }
                }
                .padding(30)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func header(_ summary: BatchSummary) -> some View {
        VStack(spacing: 12) {
            Image(systemName: summary.failures.isEmpty ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: 44))
                .foregroundStyle(summary.failures.isEmpty ? Color.green : Color.orange)

            Text(summary.converted > 0
                 ? "\(Formatting.imageCount(summary.converted)) convertida\(summary.converted == 1 ? "" : "s")"
                 : "Nada foi convertido")
                .font(.title2.weight(.medium))
        }
        .padding(.top, 10)
    }

    private func savingsCard(_ summary: BatchSummary) -> some View {
        VStack(spacing: 14) {
            HStack(spacing: 18) {
                measure("Antes", Formatting.bytes(summary.originalBytes), .secondary)
                Image(systemName: "arrow.right")
                    .foregroundStyle(.tertiary)
                measure("Depois", Formatting.bytes(summary.convertedBytes), .primary)
            }

            Divider().frame(maxWidth: 260)

            VStack(spacing: 3) {
                Text("−\(Formatting.percent(summary.savedFraction))")
                    .font(.system(size: 30, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.accentColor)
                Text("\(Formatting.bytes(summary.savedBytes)) economizados")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(22)
        .frame(maxWidth: 420)
        .background {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.primary.opacity(0.05))
        }
    }

    private func measure(_ label: String, _ value: String, _ style: HierarchicalShapeStyle) -> some View {
        VStack(spacing: 3) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.system(.title3, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(style)
        }
    }

    private func failuresSection(_ summary: BatchSummary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            DisclosureGroup(isExpanded: $showsFailures) {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(summary.failures, id: \.url) { failure in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(failure.url.lastPathComponent)
                                .font(.callout)
                            Text(failure.message)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.top, 8)
            } label: {
                Label(
                    "\(summary.failures.count) não puderam ser convertidas",
                    systemImage: "xmark.circle"
                )
                .font(.callout)
                .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: 420)
    }
}
