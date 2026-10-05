package bhookme_backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.util.UUID;

// All R2 reads/writes go through here, using the single S3Client bean from R2Config.
// (eStore's R2ImageService built its own second client; bhookme reuses the one.)
@Service
public class R2StorageService {

    @Value("${r2.bucket.name}")
    private String bucketName;

    @Value("${r2.public.url}")
    private String publicUrl;

    private final S3Client r2Client;

    public R2StorageService(S3Client r2Client) {
        this.r2Client = r2Client;
    }

    // Uploads bytes under "<folder>/<uuid><extension>" and returns the public URL.
    public String upload(byte[] bytes, String contentType, String extension, String folder) {
        String key = (folder == null || folder.isBlank() ? "" : folder + "/")
                + UUID.randomUUID() + (extension == null ? "" : extension);

        PutObjectRequest putRequest = PutObjectRequest.builder()
                .bucket(bucketName)
                .key(key)
                .contentType(contentType)
                .build();

        r2Client.putObject(putRequest, RequestBody.fromBytes(bytes));
        return trimmedPublicUrl() + "/" + key;
    }

    // True only for files stored in OUR bucket. External links (e.g. old pasted
    // photo links) are never touched by delete/download.
    public boolean isOwnUrl(String url) {
        return url != null && url.startsWith(trimmedPublicUrl() + "/");
    }

    // Deletes a file we stored. Silently ignores links that aren't ours.
    public void deleteByUrl(String url) {
        if (!isOwnUrl(url)) return;
        String key = url.substring(trimmedPublicUrl().length() + 1);
        r2Client.deleteObject(DeleteObjectRequest.builder().bucket(bucketName).key(key).build());
    }

    // Downloads a file we stored (for future cleanup/reprocessing jobs). Null if not ours.
    public byte[] downloadByUrl(String url) {
        if (!isOwnUrl(url)) return null;
        String key = url.substring(trimmedPublicUrl().length() + 1);
        ResponseBytes<GetObjectResponse> bytes = r2Client.getObjectAsBytes(
                GetObjectRequest.builder().bucket(bucketName).key(key).build());
        return bytes.asByteArray();
    }

    private String trimmedPublicUrl() {
        return publicUrl.endsWith("/") ? publicUrl.substring(0, publicUrl.length() - 1) : publicUrl;
    }
}