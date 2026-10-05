package bhookme_backend.controller;

import bhookme_backend.dto.AdminSubscriberResponse;
import bhookme_backend.service.AdminSubscriberService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Admin endpoints for the newsletter subscribers list.
 *
 * Same pattern as AdminUserController:
 *  - class-level @RequestMapping("/api/admin/subscribers")
 *  - Authentication parameter injected by JwtAuthenticationFilter
 *  - service does the admin-role check via requireAdmin()
 *  - errors wrapped in { "message": "..." } with 400 status
 */
@RestController
@RequestMapping("/api/admin/subscribers")
public class AdminSubscriberController {

    private final AdminSubscriberService adminSubscriberService;

    public AdminSubscriberController(AdminSubscriberService adminSubscriberService) {
        this.adminSubscriberService = adminSubscriberService;
    }

    // ============================================================
    // GET /api/admin/subscribers
    // Full list, newest first.
    // ============================================================
    @GetMapping
    public ResponseEntity<?> listSubscribers(Authentication authentication) {
        try {
            List<AdminSubscriberResponse> subscribers =
                    adminSubscriberService.getAllSubscribers(authentication.getName());
            return ResponseEntity.ok(subscribers);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // ============================================================
    // GET /api/admin/subscribers/count
    // Total count for the overview tile.
    // ============================================================
    @GetMapping("/count")
    public ResponseEntity<?> getCount(Authentication authentication) {
        try {
            long count = adminSubscriberService.getCount(authentication.getName());
            Map<String, Object> body = new HashMap<>();
            body.put("count", count);
            return ResponseEntity.ok(body);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // ============================================================
    // PUT /api/admin/subscribers/{id}/toggle-status
    // Flip between ACTIVE and UNSUBSCRIBED.
    // ============================================================
    @PutMapping("/{id}/toggle-status")
    public ResponseEntity<?> toggleStatus(Authentication authentication, @PathVariable Long id) {
        try {
            AdminSubscriberResponse updated =
                    adminSubscriberService.toggleStatus(authentication.getName(), id);
            return ResponseEntity.ok(updated);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // ============================================================
    // DELETE /api/admin/subscribers/{id}
    // Hard delete.
    // ============================================================
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteSubscriber(Authentication authentication, @PathVariable Long id) {
        try {
            boolean deleted = adminSubscriberService.deleteSubscriber(authentication.getName(), id);
            if (!deleted) {
                Map<String, String> body = new HashMap<>();
                body.put("message", "Subscriber not found");
                return ResponseEntity.badRequest().body(body);
            }
            Map<String, String> body = new HashMap<>();
            body.put("message", "Subscriber deleted");
            return ResponseEntity.ok(body);
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