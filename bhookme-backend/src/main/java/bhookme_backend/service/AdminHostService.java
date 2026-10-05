package bhookme_backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AdminHostService {

    private final JdbcTemplate jdbc;

    public AdminHostService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // One row per host: account info, listing counts, booking counts,
    // and average review rating across all their houses and cars.
    private static final String HOST_SELECT =
        "SELECT u.id, u.first_name AS firstName, u.last_name AS lastName, u.email, u.phone, " +
        "       u.is_active AS isActive, " +
        "       (SELECT COUNT(*) FROM properties p WHERE p.host_user_id = u.id) AS houseCount, " +
        "       (SELECT COUNT(*) FROM car_rentals c WHERE c.host_user_id = u.id) AS carCount, " +
        "       (SELECT COUNT(*) FROM bookings b JOIN properties p ON p.id = b.property_id " +
        "         WHERE p.host_user_id = u.id) AS houseBookingCount, " +
        "       (SELECT COUNT(*) FROM car_bookings cb JOIN car_rentals c ON c.id = cb.car_id " +
        "         WHERE c.host_user_id = u.id) AS carBookingCount, " +
        "       (SELECT AVG(r.rating) FROM reviews r " +
        "          LEFT JOIN properties p ON p.id = r.property_id " +
        "          LEFT JOIN car_rentals c ON c.id = r.car_id " +
        "         WHERE p.host_user_id = u.id OR c.host_user_id = u.id) AS avgRating " +
        "FROM users u " +
        "WHERE u.is_host = 1";

    private static final String HOUSE_SELECT =
        "SELECT p.*, " +
        "       CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS hostName, " +
        "       u.email AS hostEmail, " +
        "       (SELECT COUNT(*) FROM bookings b WHERE b.property_id = p.id) AS bookingCount, " +
        "       (SELECT AVG(r.rating) FROM reviews r WHERE r.property_id = p.id) AS avgRating " +
        "FROM properties p " +
        "LEFT JOIN users u ON u.id = p.host_user_id";

    private static final String CAR_SELECT =
        "SELECT c.*, " +
        "       CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS hostName, " +
        "       u.email AS hostEmail, " +
        "       (SELECT COUNT(*) FROM car_bookings cb WHERE cb.car_id = c.id) AS bookingCount, " +
        "       (SELECT AVG(r.rating) FROM reviews r WHERE r.car_id = c.id) AS avgRating " +
        "FROM car_rentals c " +
        "LEFT JOIN users u ON u.id = c.host_user_id";

    // How deep to follow "rows that point at rows that point at the listing".
    private static final int MAX_DELETE_DEPTH = 5;

    private void requireAdmin(String adminEmail) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM admins WHERE email = ?", Integer.class, adminEmail);
        if (count == null || count == 0) {
            throw new RuntimeException("Admin access required.");
        }
    }

    public List<Map<String, Object>> getHosts(String adminEmail) {
        requireAdmin(adminEmail);
        return jdbc.queryForList(HOST_SELECT + " ORDER BY u.first_name, u.last_name");
    }

    public Map<String, Object> toggleActive(String adminEmail, Long hostId) {
        requireAdmin(adminEmail);
        int updated = jdbc.update(
            "UPDATE users SET is_active = NOT COALESCE(is_active, 0) WHERE id = ? AND is_host = 1",
            hostId);
        if (updated == 0) {
            throw new RuntimeException("Host not found.");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(HOST_SELECT + " AND u.id = ?", hostId);
        if (rows.isEmpty()) {
            throw new RuntimeException("Host not found.");
        }
        return rows.get(0);
    }

    public Map<String, Object> getHostListings(String adminEmail, Long hostId) {
        requireAdmin(adminEmail);
        Map<String, Object> result = new HashMap<>();
        result.put("houses", jdbc.queryForList(HOUSE_SELECT + " WHERE p.host_user_id = ? ORDER BY p.id DESC", hostId));
        result.put("cars", jdbc.queryForList(CAR_SELECT + " WHERE c.host_user_id = ? ORDER BY c.id DESC", hostId));
        return result;
    }

    public List<Map<String, Object>> getAllHouses(String adminEmail) {
        requireAdmin(adminEmail);
        return jdbc.queryForList(HOUSE_SELECT + " ORDER BY p.id DESC");
    }

    public List<Map<String, Object>> getAllCars(String adminEmail) {
        requireAdmin(adminEmail);
        return jdbc.queryForList(CAR_SELECT + " ORDER BY c.id DESC");
    }

    // ============================================================
    // ADMIN DELETE (houses or cars), even with booking history.
    // Hosts can't delete listings that have bookings; admins can.
    // ============================================================

    // What deleting this listing will also remove - shown to the admin first.
    public Map<String, Object> deletePreview(String adminEmail, String type, Long id) {
        requireAdmin(adminEmail);
        boolean house = isHouse(type);
        String table = house ? "properties" : "car_rentals";
        requireExists(table, id);

        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("type", house ? "house" : "car");
        preview.put("id", id);
        if (house) {
            preview.put("bookings", count("SELECT COUNT(*) FROM bookings WHERE property_id = ?", id));
            preview.put("upcomingBookings", count(
                "SELECT COUNT(*) FROM bookings WHERE property_id = ? AND check_out_date >= CURDATE() " +
                "AND UPPER(COALESCE(status, '')) NOT IN ('CANCELLED','CANCELED','REJECTED','DECLINED','EXPIRED')", id));
            preview.put("reviews", count("SELECT COUNT(*) FROM reviews WHERE property_id = ?", id));
            preview.put("messages", count("SELECT COUNT(*) FROM messages WHERE property_id = ?", id));
        } else {
            preview.put("bookings", count("SELECT COUNT(*) FROM car_bookings WHERE car_id = ?", id));
            preview.put("upcomingBookings", count(
                "SELECT COUNT(*) FROM car_bookings WHERE car_id = ? AND end_date >= CURDATE() " +
                "AND UPPER(COALESCE(status, '')) NOT IN ('CANCELLED','CANCELED','REJECTED','DECLINED','EXPIRED')", id));
            preview.put("reviews", count("SELECT COUNT(*) FROM reviews WHERE car_id = ?", id));
            preview.put("messages", count("SELECT COUNT(*) FROM messages WHERE car_id = ?", id));
        }
        return preview;
    }

    // Permanently delete a listing and everything that points at it
    // (bookings, reviews, messages, photos, wishlist saves ...), all in one
    // transaction - if anything fails, nothing is deleted.
    @Transactional
    public Map<String, Object> deleteListing(String adminEmail, String type, Long id) {
        requireAdmin(adminEmail);
        boolean house = isHouse(type);
        String table = house ? "properties" : "car_rentals";
        requireExists(table, id);

        Map<String, Object> preview = deletePreview(adminEmail, type, id);
        deleteRowAndDependents(table, id, 0);

        Map<String, Object> result = new LinkedHashMap<>(preview);
        result.put("deleted", true);
        return result;
    }

    // Deletes every row (in any table) that references table.id = id,
    // following those references further down, then the row itself.
    private void deleteRowAndDependents(String table, Long id, int depth) {
        if (depth > MAX_DELETE_DEPTH) {
            throw new RuntimeException("Listing has too many linked records to delete safely.");
        }
        for (Map<String, Object> ref : referencesTo(table)) {
            String childTable = String.valueOf(ref.get("t"));
            String childColumn = String.valueOf(ref.get("c"));
            if (!safeName(childTable) || !safeName(childColumn) || childTable.equals(table)) continue;

            // Children of the child (e.g. a booking's payments) go first.
            if (!referencesTo(childTable).isEmpty() && hasIdColumn(childTable)) {
                List<Long> childIds = jdbc.queryForList(
                    "SELECT id FROM `" + childTable + "` WHERE `" + childColumn + "` = ?", Long.class, id);
                for (Long childId : childIds) {
                    deleteRowAndDependents(childTable, childId, depth + 1);
                }
            } else {
                jdbc.update("DELETE FROM `" + childTable + "` WHERE `" + childColumn + "` = ?", id);
            }
        }
        jdbc.update("DELETE FROM `" + table + "` WHERE id = ?", id);
    }

    private List<Map<String, Object>> referencesTo(String table) {
        return jdbc.queryForList(
            "SELECT table_name AS t, column_name AS c FROM information_schema.key_column_usage " +
            "WHERE table_schema = DATABASE() AND referenced_table_name = ?", table);
    }

    private boolean hasIdColumn(String table) {
        Integer n = jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.columns " +
            "WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'id'", Integer.class, table);
        return n != null && n > 0;
    }

    private boolean isHouse(String type) {
        if ("houses".equalsIgnoreCase(type) || "house".equalsIgnoreCase(type)) return true;
        if ("cars".equalsIgnoreCase(type) || "car".equalsIgnoreCase(type)) return false;
        throw new RuntimeException("Listing type must be houses or cars.");
    }

    private void requireExists(String table, Long id) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM `" + table + "` WHERE id = ?", Integer.class, id);
        if (n == null || n == 0) throw new RuntimeException("Listing not found.");
    }

    private int count(String sql, Long id) {
        try {
            Integer n = jdbc.queryForObject(sql, Integer.class, id);
            return n == null ? 0 : n;
        } catch (RuntimeException e) {
            return 0; // table/column not present
        }
    }

    private boolean safeName(String name) {
        return name != null && name.matches("[A-Za-z0-9_]+");
    }
}