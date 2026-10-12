package bhookme_backend.controller;

import bhookme_backend.service.LeaseReviewService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

// ============================================================
// Reviews for monthly stays & leases
// ------------------------------------------------------------
//   GET  /api/lease-reviews/lease/{leaseId}      public - approved reviews
//   GET  /api/lease-reviews/my-review?leaseId=3  {hasReviewed, canReview, reason}
//   POST /api/lease-reviews                      submit {leaseId, rating, title, comment,
//                                                 reviewerDisplayName, reviewerAvatarUrl}
//   POST /api/lease-reviews/{id}/photos          {imageUrls: [...]}
//   GET  /api/lease-reviews/host                 host - every review on their leases
//   PUT  /api/lease-reviews/{id}/status          host - {status: APPROVED|REJECTED|PENDING}
//   PUT  /api/lease-reviews/{id}/reply           host - {reply: "..."} (empty removes it)
// ============================================================
@RestController
@RequestMapping("/api/lease-reviews")
public class LeaseReviewController {

    private final LeaseReviewService leaseReviewService;

    public LeaseReviewController(LeaseReviewService leaseReviewService) {
        this.leaseReviewService = leaseReviewService;
    }

    @GetMapping("/lease/{leaseId}")
    public ResponseEntity<?> forLease(@PathVariable("leaseId") Long leaseId) {
        return run(() -> leaseReviewService.getLeaseReviews(leaseId));
    }

    @GetMapping("/my-review")
    public ResponseEntity<?> myReview(Authentication auth, @RequestParam("leaseId") Long leaseId) {
        return run(() -> leaseReviewService.getMyReviewStatus(email(auth), leaseId));
    }

    @PostMapping
    public ResponseEntity<?> create(Authentication auth, @RequestBody Map<String, Object> body) {
        return run(() -> leaseReviewService.createReview(email(auth), body));
    }

    @PostMapping("/{id}/photos")
    public ResponseEntity<?> photos(Authentication auth, @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        List<String> urls = new ArrayList<>();
        Object raw = body.get("imageUrls");
        if (raw instanceof List) {
            for (Object o : (List<?>) raw) {
                if (o != null) urls.add(o.toString());
            }
        }
        return run(() -> leaseReviewService.addPhotos(email(auth), id, urls));
    }

    @GetMapping("/host")
    public ResponseEntity<?> host(Authentication auth) {
        return run(() -> leaseReviewService.getHostReviews(email(auth)));
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<?> status(Authentication auth, @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        return run(() -> leaseReviewService.moderate(email(auth), id, String.valueOf(body.get("status"))));
    }

    @PutMapping("/{id}/reply")
    public ResponseEntity<?> reply(Authentication auth, @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        return run(() -> leaseReviewService.reply(email(auth), id,
                body.get("reply") == null ? null : String.valueOf(body.get("reply"))));
    }

    private String email(Authentication auth) {
        if (auth == null) throw new RuntimeException("Please log in.");
        return auth.getName();
    }

    private ResponseEntity<?> run(Supplier<Object> action) {
        try {
            return ResponseEntity.ok(action.get());
        } catch (RuntimeException e) {
            Map<String, String> body = new HashMap<>();
            body.put("message", e.getMessage() == null ? "Something went wrong." : e.getMessage());
            return ResponseEntity.badRequest().body(body);
        }
    }
}