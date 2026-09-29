import SwiftUI
import WebPKit

struct QualityPicker: View {
    @Bindable var model: ConversionModel
    @State private var showsAdvanced = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Qualidade")
                    .font(.headline)
                Spacer()
                Text("\(Int(model.quality))")
                    .font(.system(.headline, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 8) {
                ForEach(QualityPreset.allCases, id: \.self) { preset in
                    PresetButton(
                        preset: preset,
                        isSelected: model.activePreset == preset
                    ) {
                        model.quality = preset.quality
                    }
                }
            }

            Slider(value: $model.quality, in: 0...100, step: 1) {
                EmptyView()
            } minimumValueLabel: {
                Text("Menor")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            } maximumValueLabel: {
                Text("Melhor")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Text(model.activePreset?.subtitle ?? "Qualidade personalizada.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            Divider()

            WatermarkRow(model: model)

            DisclosureGroup("Opções avançadas", isExpanded: $showsAdvanced) {
                advancedOptions
                    .padding(.top, 10)
            }
            .font(.callout)
        }
    }

    private var advancedOptions: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Pasta de saída")
                TextField("webp", text: $model.outputFolderName)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 140)
                Text("ao lado do original")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Esforço do compressor")
                    Spacer()
                    Text("\(model.method)")
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
                Slider(
                    value: Binding(
                        get: { Double(model.method) },
                        set: { model.method = Int($0.rounded()) }
                    ),
                    in: 0...6,
                    step: 1
                )
                Text("Valores altos comprimem um pouco mais, e demoram mais.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }

            Toggle("Preservar metadados (data, câmera, GPS)", isOn: $model.preserveMetadata)
            Toggle("Regravar arquivos .webp já existentes", isOn: $model.overwriteExisting)
        }
        .font(.callout)
    }
}

private struct PresetButton: View {
    let preset: QualityPreset
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(preset.title)
                    .font(.callout.weight(.medium))
                Text("\(Int(preset.quality))")
                    .font(.caption)
                    .monospacedDigit()
                    .opacity(0.75)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background {
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.accentColor : Color.primary.opacity(0.06))
            }
            .foregroundStyle(isSelected ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
        .help(preset.subtitle)
    }
}
