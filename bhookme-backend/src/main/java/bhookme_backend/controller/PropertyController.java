package bhookme_backend.controller;

import bhookme_backend.dto.PropertyCreateRequest;
import bhookme_backend.dto.PropertyResponse;
import bhookme_backend.service.BookingService;
import bhookme_backend.service.PropertyService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/properties")
public class PropertyController {

    private final PropertyService propertyService;
    private final BookingService bookingService;

    public PropertyController(PropertyService propertyService, BookingService bookingService) {
        this.propertyService = propertyService;
        this.bookingService = bookingService;
    }

    @PostMapping
    public ResponseEntity<?> createProperty(Authentication authentication,
                                             @RequestBody PropertyCreateRequest request) {
        try {
            PropertyResponse response = propertyService.createProperty(authentication.getName(), request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Edit a listing's details (owner only).
    @PutMapping("/{id}")
    public ResponseEntity<?> updateProperty(Authentication authentication,
                                             @PathVariable Long id,
                                             @RequestBody PropertyCreateRequest request) {
        try {
            return ResponseEntity.ok(propertyService.updateProperty(authentication.getName(), id, request));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Pause or reactivate: {"status": "INACTIVE"} or {"status": "ACTIVE"}
    @PutMapping("/{id}/status")
    public ResponseEntity<?> setStatus(Authentication authentication,
                                       @PathVariable Long id,
                                       @RequestBody Map<String, String> body) {
        try {
            return ResponseEntity.ok(propertyService.setStatus(authentication.getName(), id, body.get("status")));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Delete a listing (owner only; refused if it has booking history).
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteProperty(Authentication authentication, @PathVariable Long id) {
        try {
            propertyService.deleteProperty(authentication.getName(), id);
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Listing deleted.");
            return ResponseEntity.ok(body);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PostMapping("/{id}/images")
    public ResponseEntity<?> uploadImages(Authentication authentication,
                                           @PathVariable Long id,
                                           @RequestParam("files") List<MultipartFile> files) {
        try {
            List<String> urls = propertyService.uploadPropertyImages(authentication.getName(), id, files);
            return ResponseEntity.ok(urls);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Attaches photos that were already uploaded through /api/upload/image
    // (resized + stored in R2) to a listing, in the order given.
    //   body: {"imageUrls": ["https://pub-....r2.dev/properties/abc.jpg", ...]}
    @PostMapping("/{id}/image-urls")
    public ResponseEntity<?> addImageUrls(Authentication authentication,
                                          @PathVariable Long id,
                                          @RequestBody Map<String, Object> body) {
        try {
            PropertyResponse response = propertyService.addPropertyImageUrls(
                    authentication.getName(), id, urlList(body));
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Replaces ALL photos with the given list, in order (used by Edit listing).
    @PutMapping("/{id}/image-urls")
    public ResponseEntity<?> replaceImageUrls(Authentication authentication,
                                              @PathVariable Long id,
                                              @RequestBody Map<String, Object> body) {
        try {
            PropertyResponse response = propertyService.replacePropertyImageUrls(
                    authentication.getName(), id, urlList(body));
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getProperty(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(propertyService.getPropertyById(id));
        } catch (RuntimeException e) {
            Map<String, String> error = new HashMap<>();
            error.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
        }
    }

    // Public: returns every paid+confirmed booking's date range for
    // this property, so the guest date picker can strike those dates
    // out. Shape: [{"checkIn": "2026-10-12", "checkOut": "2026-10-15"}, ...]
    @GetMapping("/{id}/blocked-dates")
    public ResponseEntity<?> blockedDates(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(bookingService.getBlockedDates(id));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping
    public ResponseEntity<List<PropertyResponse>> getActiveProperties() {
        return ResponseEntity.ok(propertyService.getActiveProperties());
    }

    @GetMapping("/nearest")
    public ResponseEntity<List<PropertyResponse>> getNearestProperties(
            @RequestParam double lat,
            @RequestParam double lng,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(propertyService.getNearestProperties(lat, lng, limit));
    }

    @GetMapping("/mine")
    public ResponseEntity<List<PropertyResponse>> getMyProperties(Authentication authentication) {
        return ResponseEntity.ok(propertyService.getMyProperties(authentication.getName()));
    }

    private List<String> urlList(Map<String, Object> body) {
        List<String> urls = new ArrayList<>();
        Object raw = body.get("imageUrls");
        if (raw instanceof List) {
            for (Object o : (List<?>) raw) {
                if (o != null) urls.add(o.toString().trim());
            }
        }
        return urls;
    }

    private ResponseEntity<?> error(RuntimeException e) {
        Map<String, String> error = new HashMap<>();
        error.put("message", e.getMessage());
        return ResponseEntity.badRequest().body(error);
    }
}