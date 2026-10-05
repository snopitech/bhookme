package bhookme_backend.controller;

import bhookme_backend.dto.BookingCreateRequest;
import bhookme_backend.dto.BookingResponse;
import bhookme_backend.dto.QuoteResponse;
import bhookme_backend.service.BookingService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    @GetMapping("/quote")
    public ResponseEntity<?> quote(
            @RequestParam("propertyId") Long propertyId,
            @RequestParam("checkIn") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkIn,
            @RequestParam("checkOut") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkOut,
            @RequestParam(value = "guests", defaultValue = "1") int guests) {
        try {
            QuoteResponse quote = bookingService.getQuote(propertyId, checkIn, checkOut, guests);
            return ResponseEntity.ok(quote);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PostMapping
    public ResponseEntity<?> create(Authentication authentication,
                                     @RequestBody BookingCreateRequest request) {
        try {
            BookingResponse response = bookingService.createBooking(authentication.getName(), request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/mine")
    public ResponseEntity<List<BookingResponse>> mine(Authentication authentication) {
        return ResponseEntity.ok(bookingService.getMyBookings(authentication.getName()));
    }

    @GetMapping("/host")
    public ResponseEntity<List<BookingResponse>> host(Authentication authentication) {
        return ResponseEntity.ok(bookingService.getHostBookings(authentication.getName()));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<?> cancel(Authentication authentication, @PathVariable("id") Long id) {
        try {
            BookingResponse response = bookingService.cancelBooking(authentication.getName(), id);
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    /**
     * Host toggles the paid flag on a booking. Body: { "paid": true } or
     * { "paid": false }. When paid AND status is CONFIRMED, the booking
     * blocks its dates (greyed/struck-through on the guest date picker).
     * Toggling paid back to false releases the dates.
     *
     * Until Stripe is wired up, the host clicks this manually. Later, the
     * Stripe webhook will call the service method directly - this endpoint
     * stays for host override/undo.
     */
    @PutMapping("/{id}/paid")
    public ResponseEntity<?> setPaid(Authentication authentication,
                                      @PathVariable("id") Long id,
                                      @RequestBody Map<String, Object> body) {
        try {
            Boolean paid = body.get("paid") instanceof Boolean ? (Boolean) body.get("paid") : null;
            if (paid == null) {
                Map<String, String> err = new HashMap<>();
                err.put("message", "Body must include a boolean 'paid' field.");
                return ResponseEntity.badRequest().body(err);
            }
            BookingResponse response = bookingService.setBookingPaid(authentication.getName(), id, paid);
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    /**
     * Host confirms a booking. Only a PAID booking can be confirmed -
     * the service enforces that. Once confirmed AND paid, the dates
     * block. Status can be set to CONFIRMED (default) or back to PENDING
     * if the host wants to unconfirm (body: { "status": "PENDING" }).
     */
    @PutMapping("/{id}/confirm")
    public ResponseEntity<?> confirm(Authentication authentication,
                                      @PathVariable("id") Long id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        try {
            String status = body != null && body.get("status") != null
                    ? body.get("status").toString()
                    : "CONFIRMED";
            BookingResponse response = bookingService.setBookingConfirmed(authentication.getName(), id, status);
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    /**
     * Host declines a booking. Body: { "reason": "Dates already taken" }.
     * Reason is optional but recommended - it goes into the guest's
     * decline email. Sets the booking to CANCELLED.
     */
    @PutMapping("/{id}/decline")
    public ResponseEntity<?> decline(Authentication authentication,
                                      @PathVariable("id") Long id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        try {
            String reason = body != null && body.get("reason") != null
                    ? body.get("reason").toString()
                    : null;
            BookingResponse response = bookingService.declineBooking(authentication.getName(), id, reason);
            return ResponseEntity.ok(response);
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