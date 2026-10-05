package bhookme_backend.controller;

import bhookme_backend.dto.ReviewCreateRequest;
import bhookme_backend.dto.ReviewResponse;
import bhookme_backend.model.ReviewStatus;
import bhookme_backend.service.ReviewService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reviews")
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @GetMapping("/property/{propertyId}")
    public ResponseEntity<List<ReviewResponse>> propertyReviews(@PathVariable Long propertyId) {
        return ResponseEntity.ok(reviewService.getPropertyReviews(propertyId));
    }

    @GetMapping("/car/{carId}")
    public ResponseEntity<List<ReviewResponse>> carReviews(@PathVariable Long carId) {
        return ResponseEntity.ok(reviewService.getCarReviews(carId));
    }

    @PostMapping
    public ResponseEntity<?> submit(Authentication authentication, @RequestBody ReviewCreateRequest request) {
        try {
            return ResponseEntity.ok(reviewService.createReview(authentication.getName(), request));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/my-review")
    public ResponseEntity<?> myReview(Authentication authentication,
                                       @RequestParam(required = false) Long propertyId,
                                       @RequestParam(required = false) Long carId) {
        return ResponseEntity.ok(reviewService.getMyReviewStatus(authentication.getName(), propertyId, carId));
    }

    @GetMapping("/pending")
    public ResponseEntity<?> pending(Authentication authentication) {
        return ResponseEntity.ok(reviewService.getPendingReviewsForHost(authentication.getName()));
    }

    // Every review on the logged-in host's listings, any status - Host Dashboard Reviews tab.
    @GetMapping("/host")
    public ResponseEntity<?> hostReviews(Authentication authentication) {
        try {
            return ResponseEntity.ok(reviewService.getAllReviewsForHost(authentication.getName()));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Approve/reject - listing host or admin only.
    @PutMapping("/moderate/{id}")
    public ResponseEntity<?> moderate(Authentication authentication, @PathVariable Long id,
                                      @RequestBody Map<String, String> body) {
        ReviewStatus newStatus;
        try {
            newStatus = ReviewStatus.valueOf(String.valueOf(body.get("status")).toUpperCase());
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("message", "Status must be APPROVED, REJECTED or PENDING.");
            return ResponseEntity.badRequest().body(error);
        }
        try {
            return ResponseEntity.ok(reviewService.moderate(authentication.getName(), id, newStatus));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Host's public reply: {"reply": "Thanks for staying!"}. Empty text removes it.
    @PutMapping("/{id}/reply")
    public ResponseEntity<?> reply(Authentication authentication, @PathVariable Long id,
                                   @RequestBody Map<String, String> body) {
        try {
            return ResponseEntity.ok(reviewService.reply(authentication.getName(), id, body.get("reply")));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Attach uploaded photos to the caller's own review:
    //   {"imageUrls": ["https://pub-....r2.dev/reviews/abc.jpg", ...]}
    @PostMapping("/{id}/photos")
    public ResponseEntity<?> addPhotos(Authentication authentication, @PathVariable Long id,
                                       @RequestBody Map<String, Object> body) {
        try {
            List<String> urls = new java.util.ArrayList<>();
            Object raw = body.get("imageUrls");
            if (raw instanceof List) {
                for (Object o : (List<?>) raw) {
                    if (o != null) urls.add(o.toString());
                }
            }
            return ResponseEntity.ok(reviewService.addPhotos(authentication.getName(), id, urls));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    private ResponseEntity<?> error(RuntimeException e) {
        Map<String, String> body = new HashMap<>();
        body.put("message", e.getMessage());
        return ResponseEntity.badRequest().body(body);
    }
}