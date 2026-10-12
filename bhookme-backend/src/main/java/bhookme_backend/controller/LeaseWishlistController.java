package bhookme_backend.controller;

import bhookme_backend.model.User;
import bhookme_backend.repository.UserRepository;
import bhookme_backend.service.LeaseService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// Saved monthly stays, alongside saved homes (/api/wishlist) and
// saved cars (/api/wishlist/cars).
//   GET    /api/wishlist/leases/ids         -> [3, 7, ...]
//   GET    /api/wishlist/leases             -> full lease listings, newest saved first
//   POST   /api/wishlist/leases/{leaseId}   -> save
//   DELETE /api/wishlist/leases/{leaseId}   -> remove
// Login required (covered by SecurityConfig's anyRequest().authenticated()).
// The lease_wishlist table is created on startup - no manual SQL needed.
@RestController
@RequestMapping("/api/wishlist/leases")
public class LeaseWishlistController {

    private static final Logger log = LoggerFactory.getLogger(LeaseWishlistController.class);

    private final JdbcTemplate jdbc;
    private final UserRepository userRepository;
    private final LeaseService leaseService;

    public LeaseWishlistController(JdbcTemplate jdbc, UserRepository userRepository, LeaseService leaseService) {
        this.jdbc = jdbc;
        this.userRepository = userRepository;
        this.leaseService = leaseService;
    }

    @PostConstruct
    void createTable() {
        try {
            jdbc.execute("CREATE TABLE IF NOT EXISTS lease_wishlist ("
                    + " id BIGINT AUTO_INCREMENT PRIMARY KEY,"
                    + " user_id BIGINT NOT NULL,"
                    + " lease_id BIGINT NOT NULL,"
                    + " created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                    + " UNIQUE KEY uq_lease_wishlist (user_id, lease_id)"
                    + ")");
        } catch (Exception e) {
            log.warn("Could not create lease_wishlist table: {}", e.getMessage());
        }
    }

    @GetMapping("/ids")
    public ResponseEntity<?> ids(Authentication authentication) {
        try {
            Long userId = userId(authentication);
            return ResponseEntity.ok(jdbc.queryForList(
                    "SELECT lease_id FROM lease_wishlist WHERE user_id = ? ORDER BY created_at DESC, id DESC",
                    Long.class, userId));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping
    public ResponseEntity<?> list(Authentication authentication) {
        try {
            Long userId = userId(authentication);
            List<Long> ids = jdbc.queryForList(
                    "SELECT lease_id FROM lease_wishlist WHERE user_id = ? ORDER BY created_at DESC, id DESC",
                    Long.class, userId);
            List<Map<String, Object>> leases = new ArrayList<>();
            for (Long id : ids) {
                try {
                    leases.add(leaseService.getLease(id));
                } catch (RuntimeException ignored) {
                    // listing was deleted - skip it
                }
            }
            return ResponseEntity.ok(leases);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PostMapping("/{leaseId}")
    public ResponseEntity<?> add(Authentication authentication, @PathVariable("leaseId") Long leaseId) {
        try {
            Long userId = userId(authentication);
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM leases WHERE id = ? AND deleted = 0", Integer.class, leaseId);
            if (exists == null || exists == 0) throw new RuntimeException("Lease listing not found");
            // Saving the same listing twice is a no-op, not an error.
            jdbc.update("INSERT IGNORE INTO lease_wishlist (user_id, lease_id) VALUES (?, ?)", userId, leaseId);
            return ResponseEntity.ok().build();
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @DeleteMapping("/{leaseId}")
    public ResponseEntity<?> remove(Authentication authentication, @PathVariable("leaseId") Long leaseId) {
        try {
            Long userId = userId(authentication);
            jdbc.update("DELETE FROM lease_wishlist WHERE user_id = ? AND lease_id = ?", userId, leaseId);
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