package bhookme_backend.controller;

import bhookme_backend.service.AdminBookingService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Admin endpoints for viewing house + car bookings.
 *
 * GET /api/admin/bookings        - combined list, newest first
 * GET /api/admin/bookings/counts - summary counts for the cards
 *
 * Read-only - no status changes here.
 */
@RestController
@RequestMapping("/api/admin/bookings")
public class AdminBookingController {

    private final AdminBookingService adminBookingService;

    public AdminBookingController(AdminBookingService adminBookingService) {
        this.adminBookingService = adminBookingService;
    }

    @GetMapping
    public ResponseEntity<?> listBookings(Authentication authentication) {
        try {
            List<Map<String, Object>> bookings =
                    adminBookingService.getAllBookings(authentication.getName());
            return ResponseEntity.ok(bookings);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/counts")
    public ResponseEntity<?> getCounts(Authentication authentication) {
        try {
            return ResponseEntity.ok(adminBookingService.getCounts(authentication.getName()));
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
