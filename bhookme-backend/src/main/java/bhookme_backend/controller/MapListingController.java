package bhookme_backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

// Public, read-only feed for the map on bhookme-dashboard:
// every ACTIVE property that has coordinates, plus its first photo.
@RestController
@RequestMapping("/api/properties/map")
public class MapListingController {

    private final JdbcTemplate jdbc;

    public MapListingController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public ResponseEntity<?> mapListings() {
        try {
            List<Map<String, Object>> properties = jdbc.queryForList(
                "SELECT p.* FROM properties p " +
                "WHERE p.status = 'ACTIVE' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL " +
                "ORDER BY p.id DESC");

            // First photo per property (lowest display_order).
            Map<Object, Map<String, Object>> firstImage = new HashMap<>();
            for (Map<String, Object> img : jdbc.queryForList(
                    "SELECT * FROM property_images ORDER BY property_id, display_order")) {
                firstImage.putIfAbsent(String.valueOf(img.get("property_id")), img);
            }
            for (Map<String, Object> p : properties) {
                p.put("image", firstImage.get(String.valueOf(p.get("id"))));
            }
            return ResponseEntity.ok(properties);
        } catch (RuntimeException e) {
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) {
                root = root.getCause();
            }
            Map<String, String> body = new HashMap<>();
            body.put("message", root.getMessage() != null ? root.getMessage() : e.getMessage());
            return ResponseEntity.badRequest().body(body);
        }
    }
}