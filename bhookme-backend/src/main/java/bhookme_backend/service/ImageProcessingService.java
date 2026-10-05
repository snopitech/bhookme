package bhookme_backend.service;

import net.coobird.thumbnailator.Thumbnails;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

// Resize + compress images before they go to R2. Same rules as eStore's
// FileUploadController/ImageProcessingService:
//   - longest side capped at 1600px, never upscales smaller images
//   - JPEGs re-encoded at quality 0.82
//   - PNG stays PNG (keeps transparency), GIF stays GIF
//   - Thumbnailator reads the raw bytes so phone-photo EXIF rotation is respected
//   - anything ImageIO can't decode (e.g. HEIC, most WebP) is passed through untouched
// One difference from eStore: the returned content type and file extension always
// match the bytes actually produced (eStore could store PNG bytes under a .webp name).
@Service
public class ImageProcessingService {

    public static final int MAX_DIMENSION = 1600;
    public static final float JPEG_QUALITY = 0.82f;

    public record ProcessedImage(byte[] bytes, String contentType, String extension) {}

    public ProcessedImage resizeAndCompressImage(byte[] original, String contentType, String originalFilename)
            throws IOException {
        BufferedImage probeImage = ImageIO.read(new ByteArrayInputStream(original));
        if (probeImage == null) {
            // Can't decode it: store exactly what was uploaded.
            return new ProcessedImage(original, contentType, extensionFor(contentType, originalFilename));
        }

        int width = probeImage.getWidth();
        int height = probeImage.getHeight();
        boolean needsResize = width > MAX_DIMENSION || height > MAX_DIMENSION;

        String outputFormat = determineOutputFormat(contentType);
        boolean isJpeg = "jpg".equals(outputFormat);

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

        var builder = Thumbnails.of(new ByteArrayInputStream(original))
                .outputFormat(outputFormat);

        if (needsResize) {
            builder = builder.size(MAX_DIMENSION, MAX_DIMENSION);
        } else {
            builder = builder.scale(1.0);
        }

        if (isJpeg) {
            builder = builder.outputQuality(JPEG_QUALITY);
        }

        builder.toOutputStream(outputStream);
        return new ProcessedImage(outputStream.toByteArray(), contentTypeFor(outputFormat), "." + outputFormat);
    }

    private String determineOutputFormat(String contentType) {
        if (contentType == null) return "jpg";
        String lower = contentType.toLowerCase();
        if (lower.contains("png")) return "png";
        if (lower.contains("gif")) return "gif";
        if (lower.contains("webp")) return "png";
        return "jpg";
    }

    private String contentTypeFor(String outputFormat) {
        switch (outputFormat) {
            case "png": return "image/png";
            case "gif": return "image/gif";
            default: return "image/jpeg";
        }
    }

    // Extension for files stored as-is: prefer the uploaded name, fall back to the type.
    private String extensionFor(String contentType, String originalFilename) {
        if (originalFilename != null && originalFilename.contains(".")) {
            String ext = originalFilename.substring(originalFilename.lastIndexOf(".")).toLowerCase();
            if (ext.matches("\\.[a-z0-9]{1,5}")) return ext;
        }
        if (contentType == null) return "";
        String lower = contentType.toLowerCase();
        if (lower.contains("jpeg") || lower.contains("jpg")) return ".jpg";
        if (lower.contains("png")) return ".png";
        if (lower.contains("gif")) return ".gif";
        if (lower.contains("webp")) return ".webp";
        if (lower.contains("heic")) return ".heic";
        if (lower.contains("heif")) return ".heif";
        return "";
    }
}