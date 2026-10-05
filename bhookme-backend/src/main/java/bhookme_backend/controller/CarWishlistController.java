package bhookme_backend.controller;

import bhookme_backend.dto.CarResponse;
import bhookme_backend.model.User;
import bhookme_backend.repository.UserRepository;
import bhookme_backend.service.CarService;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// Saved cars, alongside the existing home wishlist (/api/wishlist).
//   GET    /api/wishlist/cars/ids        -> [3, 7, ...]
//   GET    /api/wishlist/cars            -> full car details, newest saved first
//   POST   /api/wishlist/cars/{carId}    -> save
//   DELETE /api/wishlist/cars/{carId}    -> remove
// Login required (covered by SecurityConfig's anyRequest().authenticated()).
@RestController
@RequestMapping("/api/wishlist/cars")
public class CarWishlistController {

    private final JdbcTemplate jdbc;
    private final UserRepository userRepository;
    private final CarService carService;

    public CarWishlistController(JdbcTemplate jdbc, UserRepository userRepository, CarService carService) {
        this.jdbc = jdbc;
        this.userRepository = userRepository;
        this.carService = carService;
    }

    @GetMapping("/ids")
    public ResponseEntity<?> ids(Authentication authentication) {
        try {
            Long userId = userId(authentication);
            return ResponseEntity.ok(jdbc.queryForList(
                    "SELECT car_id FROM car_wishlist WHERE user_id = ? ORDER BY created_at DESC", Long.class, userId));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping
    public ResponseEntity<?> list(Authentication authentication) {
        try {
            Long userId = userId(authentication);
            List<Long> ids = jdbc.queryForList(
                    "SELECT car_id FROM car_wishlist WHERE user_id = ? ORDER BY created_at DESC", Long.class, userId);
            List<CarResponse> cars = new ArrayList<>();
            for (Long id : ids) {
                try {
                    cars.add(carService.getCarById(id));
                } catch (RuntimeException ignored) {
                    // car was removed - skip it
                }
            }
            return ResponseEntity.ok(cars);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PostMapping("/{carId}")
    public ResponseEntity<?> add(Authentication authentication, @PathVariable("carId") Long carId) {
        try {
            Long userId = userId(authentication);
            Integer exists = jdbc.queryForObject("SELECT COUNT(*) FROM car_rentals WHERE id = ?", Integer.class, carId);
            if (exists == null || exists == 0) throw new RuntimeException("Car not found");
            // Saving the same car twice is a no-op, not an error.
            jdbc.update("INSERT IGNORE INTO car_wishlist (user_id, car_id) VALUES (?, ?)", userId, carId);
            return ResponseEntity.ok().build();
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @DeleteMapping("/{carId}")
    public ResponseEntity<?> remove(Authentication authentication, @PathVariable("carId") Long carId) {
        try {
            Long userId = userId(authentication);
            jdbc.update("DELETE FROM car_wishlist WHERE user_id = ? AND car_id = ?", userId, carId);
            return ResponseEntity.ok().build();
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    private Long userId(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) throw new RuntimeException("Please log in.");
        User user = userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new RuntimeException("Account not found"));
        return user.getId();
    }

    private ResponseEntity<?> error(RuntimeException e) {
        Map<String, String> body = new HashMap<>();
        body.put("message", e.getMessage());
        return ResponseEntity.badRequest().body(body);
    }
}