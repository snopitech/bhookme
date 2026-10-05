package bhookme_backend.controller;

import bhookme_backend.service.ImageProcessingService;
import bhookme_backend.service.ImageProcessingService.ProcessedImage;
import bhookme_backend.service.R2StorageService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

// Image upload, same flow as eStore's marketplace-api FileUploadController:
//   login required -> images only -> 10MB max -> resize/compress -> put to R2 -> {"url": ...}
//
//   POST /api/upload/image   (multipart: file, optional folder)
//   folder groups files in the bucket: properties | experiences | cars | profiles
@RestController
@RequestMapping("/api/upload")
public class FileUploadController {

    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;
    private static final Set<String> FOLDERS = Set.of("properties", "experiences", "cars", "profiles");

    private final ImageProcessingService imageProcessingService;
    private final R2StorageService r2StorageService;

    public FileUploadController(ImageProcessingService imageProcessingService, R2StorageService r2StorageService) {
        this.imageProcessingService = imageProcessingService;
        this.r2StorageService = r2StorageService;
    }

    @PostMapping("/image")
    public ResponseEntity<?> uploadImage(Authentication authentication,
                                         @RequestParam("file") MultipartFile file,
                                         @RequestParam(value = "folder", required = false) String folder) {

        // SecurityConfig already requires login for this path; this is a second guard.
        if (authentication == null || authentication.getName() == null) {
            return message(HttpStatus.UNAUTHORIZED, "Please log in to upload photos.");
        }

        String contentType = file.getContentType();
        if (file.isEmpty() || contentType == null || !contentType.startsWith("image/")) {
            return message(HttpStatus.BAD_REQUEST, "Only image files are allowed.");
        }

        if (file.getSize() > MAX_IMAGE_BYTES) {
            return message(HttpStatus.BAD_REQUEST, "File size must be less than 10MB.");
        }

        String safeFolder = (folder != null && FOLDERS.contains(folder)) ? folder : "misc";

        try {
            ProcessedImage processed = imageProcessingService.resizeAndCompressImage(
                    file.getBytes(), contentType, file.getOriginalFilename());

            String fileUrl = r2StorageService.upload(
                    processed.bytes(), processed.contentType(), processed.extension(), safeFolder);

            Map<String, Object> response = new HashMap<>();
            response.put("url", fileUrl);
            response.put("originalBytes", file.getSize());
            response.put("storedBytes", processed.bytes().length);
            return ResponseEntity.ok(response);

        } catch (IOException e) {
            return message(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to upload file: " + e.getMessage());
        } catch (RuntimeException e) {
            return message(HttpStatus.INTERNAL_SERVER_ERROR, "Upload to storage failed: " + e.getMessage());
        }
    }

    private ResponseEntity<?> message(HttpStatus status, String text) {
        Map<String, String> body = new HashMap<>();
        body.put("message", text);
        return ResponseEntity.status(status).body(body);
    }
}