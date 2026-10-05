package bhookme_backend.controller;

import bhookme_backend.dto.CarBookingCreateRequest;
import bhookme_backend.dto.CarBookingResponse;
import bhookme_backend.dto.CarQuoteResponse;
import bhookme_backend.service.CarBookingService;
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
@RequestMapping("/api/car-bookings")
public class CarBookingController {

    private final CarBookingService carBookingService;

    public CarBookingController(CarBookingService carBookingService) {
        this.carBookingService = carBookingService;
    }

    @GetMapping("/quote")
    public ResponseEntity<?> quote(
            @RequestParam("carId") Long carId,
            @RequestParam("startDate") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam("endDate") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        try {
            CarQuoteResponse quote = carBookingService.getQuote(carId, startDate, endDate);
            return ResponseEntity.ok(quote);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PostMapping
    public ResponseEntity<?> create(Authentication authentication,
                                     @RequestBody CarBookingCreateRequest request) {
        try {
            CarBookingResponse response = carBookingService.createBooking(authentication.getName(), request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/mine")
    public ResponseEntity<List<CarBookingResponse>> mine(Authentication authentication) {
        return ResponseEntity.ok(carBookingService.getMyBookings(authentication.getName()));
    }

    // Every car booking made on any car owned by this host. Powers the
    // unified Bookings tab in the host dashboard (mixed with house
    // bookings from GET /api/bookings/host).
    @GetMapping("/host")
    public ResponseEntity<List<CarBookingResponse>> host(Authentication authentication) {
        return ResponseEntity.ok(carBookingService.getHostBookings(authentication.getName()));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<?> cancel(Authentication authentication, @PathVariable("id") Long id) {
        try {
            CarBookingResponse response = carBookingService.cancelBooking(authentication.getName(), id);
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    /**
     * Host toggles the paid flag on a car booking. Body: { "paid": true }
     * or { "paid": false }. When paid AND status is CONFIRMED, the
     * booking blocks its dates (greyed/struck-through on the guest date
     * picker). Toggling paid back to false releases the dates.
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
            CarBookingResponse response = carBookingService.setBookingPaid(authentication.getName(), id, paid);
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    /**
     * Host confirms a car booking. Only a PAID booking can be confirmed.
     * Body: { "status": "CONFIRMED" } (default) or { "status": "PENDING" }
     * to un-confirm.
     */
    @PutMapping("/{id}/confirm")
    public ResponseEntity<?> confirm(Authentication authentication,
                                      @PathVariable("id") Long id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        try {
            String status = body != null && body.get("status") != null
                    ? body.get("status").toString()
                    : "CONFIRMED";
            CarBookingResponse response = carBookingService.setBookingConfirmed(authentication.getName(), id, status);
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    /**
     * Host declines a car booking. Body: { "reason": "Car already booked" }.
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
            CarBookingResponse response = carBookingService.declineBooking(authentication.getName(), id, reason);
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