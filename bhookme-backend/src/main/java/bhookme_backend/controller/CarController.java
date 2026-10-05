package bhookme_backend.controller;

import bhookme_backend.dto.CarResponse;
import bhookme_backend.service.CarBookingService;
import bhookme_backend.service.CarService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/cars")
public class CarController {

    private final CarService carService;
    private final CarBookingService carBookingService;

    public CarController(CarService carService, CarBookingService carBookingService) {
        this.carService = carService;
        this.carBookingService = carBookingService;
    }

    @GetMapping
    public ResponseEntity<List<CarResponse>> getAll() {
        return ResponseEntity.ok(carService.getActiveCars());
    }

    // The logged-in host's own cars (login required - see SecurityConfig).
    @GetMapping("/mine")
    public ResponseEntity<?> mine(Authentication authentication) {
        try {
            return ResponseEntity.ok(carService.getMyCars(authentication == null ? null : authentication.getName()));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getOne(@PathVariable("id") Long id) {
        try {
            return ResponseEntity.ok(carService.getCarById(id));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Public: returns every paid+confirmed booking's date range for
    // this car, so the guest date picker can strike those dates out.
    // Shape: [{"startDate": "2026-10-12", "endDate": "2026-10-15"}, ...]
    @GetMapping("/{id}/blocked-dates")
    public ResponseEntity<?> blockedDates(@PathVariable("id") Long id) {
        try {
            return ResponseEntity.ok(carBookingService.getBlockedDates(id));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Create a car listing:
    //   {"make","model","year","category","city","state","dailyRate","imageUrls":[...]}
    @PostMapping
    public ResponseEntity<?> create(Authentication authentication, @RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(carService.createCar(authentication.getName(), body));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Pause or reactivate: {"status": "INACTIVE"} or {"status": "ACTIVE"}
    @PutMapping("/{id}/status")
    public ResponseEntity<?> setStatus(Authentication authentication, @PathVariable("id") Long id,
                                       @RequestBody Map<String, String> body) {
        try {
            return ResponseEntity.ok(carService.setStatus(authentication.getName(), id, body.get("status")));
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