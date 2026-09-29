import CWebP
import Foundation

public enum WebPEncoder {
    /// Comprime um bitmap RGBA em WebP com perdas.
    ///
    /// Usa a API de `WebPPicture`/`WebPConfig` em vez do atalho
    /// `WebPEncodeRGBA` porque só ela dá acesso a `method` e à qualidade do
    /// canal alfa.
    public static func encode(_ image: DecodedImage, settings: ConversionSettings) throws -> Data {
        let abi = cwebp_shim_encoder_abi_version()

        var config = WebPConfig()
        guard WebPConfigInitInternal(&config, WEBP_PRESET_DEFAULT, 75, abi) != 0 else {
            throw ConversionError.encoderUnavailable
        }
        config.quality = settings.clampedQuality
        config.method = settings.clampedMethod
        config.alpha_quality = 100
        // A paralelização acontece por arquivo, no nível acima; threads internas
        // aqui só disputariam os mesmos núcleos.
        config.thread_level = 0

        guard WebPValidateConfig(&config) != 0 else {
            throw ConversionError.invalidQuality(settings.quality)
        }

        var picture = WebPPicture()
        guard WebPPictureInitInternal(&picture, abi) != 0 else {
            throw ConversionError.encoderUnavailable
        }
        defer { WebPPictureFree(&picture) }

        picture.use_argb = 1
        picture.width = Int32(image.width)
        picture.height = Int32(image.height)

        guard let base = image.pixels.baseAddress else { throw ConversionError.emptyImage }
        let stride = Int32(image.bytesPerRow)
        let imported = image.hasAlpha
            ? WebPPictureImportRGBA(&picture, base, stride)
            : WebPPictureImportRGBX(&picture, base, stride)
        guard imported != 0 else { throw ConversionError.encodingFailed(code: nil) }

        var writer = WebPMemoryWriter()
        WebPMemoryWriterInit(&writer)

        let encoded: Bool = withUnsafeMutablePointer(to: &writer) { writerPointer in
            picture.writer = WebPMemoryWrite
            picture.custom_ptr = UnsafeMutableRawPointer(writerPointer)
            return WebPEncode(&config, &picture) != 0
        }

        guard encoded, let memory = writer.mem, writer.size > 0 else {
            WebPMemoryWriterClear(&writer)
            throw ConversionError.encodingFailed(code: Int32(bitPattern: picture.error_code.rawValue))
        }

        let data = Data(bytes: memory, count: writer.size)
        WebPMemoryWriterClear(&writer)
        return data
    }

    /// Reinsere o bloco EXIF no arquivo já comprimido, remontando o container
    /// RIFF com o `mux` da libwebp.
    ///
    /// Se qualquer etapa falhar devolvemos o WebP original: metadado é um extra,
    /// não vale perder a conversão por causa dele.
    public static func attachingEXIF(_ exif: Data, to webp: Data) -> Data {
        guard !exif.isEmpty else { return webp }

        // O construtor público `WebPMuxNew()` é um inline em cima deste.
        guard let mux = WebPNewInternal(cwebp_shim_mux_abi_version()) else { return webp }
        defer { WebPMuxDelete(mux) }

        let assembled: Data? = webp.withUnsafeBytes { webpBytes -> Data? in
            guard let webpBase = webpBytes.bindMemory(to: UInt8.self).baseAddress else { return nil }
            var imageData = WebPData(bytes: webpBase, size: webpBytes.count)
            guard WebPMuxSetImage(mux, &imageData, 1) == WEBP_MUX_OK else { return nil }

            return exif.withUnsafeBytes { exifBytes -> Data? in
                guard let exifBase = exifBytes.bindMemory(to: UInt8.self).baseAddress else { return nil }
                var exifData = WebPData(bytes: exifBase, size: exifBytes.count)
                guard WebPMuxSetChunk(mux, "EXIF", &exifData, 1) == WEBP_MUX_OK else { return nil }

                var output = WebPData()
                guard WebPMuxAssemble(mux, &output) == WEBP_MUX_OK, let bytes = output.bytes else {
                    return nil
                }
                defer { WebPDataClear(&output) }
                return Data(bytes: bytes, count: output.size)
            }
        }

        return assembled ?? webp
    }
}
