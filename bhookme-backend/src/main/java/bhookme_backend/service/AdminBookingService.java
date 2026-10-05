package bhookme_backend.service;

import bhookme_backend.repository.AdminRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Admin-side read access to house + car bookings.
 *
 * Uses JdbcTemplate (matches the rest of the admin services).
 * Every method calls requireAdmin() first.
 *
 * The two booking tables have different columns (check_in/check_out
 * vs start/end), and car_rentals has no "title" column (make + model
 * + year instead), so we query them separately and merge in Java
 * rather than trying to UNION ALL them.
 */
@Service
public class AdminBookingService {

    private final JdbcTemplate jdbc;
    private final AdminRepository adminRepository;

    public AdminBookingService(JdbcTemplate jdbc, AdminRepository adminRepository) {
        this.jdbc = jdbc;
        this.adminRepository = adminRepository;
    }

    private static final String HOUSE_SQL =
        "SELECT b.id, " +
        "       'HOUSE' AS type, " +
        "       b.guest_user_id AS guestId, " +
        "       CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS guestName, " +
        "       u.email AS guestEmail, " +
        "       u.phone AS guestPhone, " +
        "       p.id AS listingId, " +
        "       p.title AS listingTitle, " +
        "       CONCAT(p.city, ', ', p.state) AS listingLocation, " +
        "       b.check_in_date AS startDate, " +
        "       b.check_out_date AS endDate, " +
        "       b.num_guests AS guests, " +
        "       b.total_price AS totalPrice, " +
        "       b.status AS status, " +
        "       b.created_at AS createdAt " +
        "FROM bookings b " +
        "LEFT JOIN users u ON u.id = b.guest_user_id " +
        "LEFT JOIN properties p ON p.id = b.property_id";

    // car_rentals has make + model + year, not a single title column.
    private static final String CAR_SQL =
        "SELECT b.id, " +
        "       'CAR' AS type, " +
        "       b.guest_user_id AS guestId, " +
        "       CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS guestName, " +
        "       u.email AS guestEmail, " +
        "       u.phone AS guestPhone, " +
        "       c.id AS listingId, " +
        "       CONCAT(c.year, ' ', c.make, ' ', c.model) AS listingTitle, " +
        "       CONCAT(c.city, ', ', c.state) AS listingLocation, " +
        "       b.start_date AS startDate, " +
        "       b.end_date AS endDate, " +
        "       NULL AS guests, " +
        "       b.total_price AS totalPrice, " +
        "       b.status AS status, " +
        "       b.created_at AS createdAt " +
        "FROM car_bookings b " +
        "LEFT JOIN users u ON u.id = b.guest_user_id " +
        "LEFT JOIN car_rentals c ON c.id = b.car_id";

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAllBookings(String adminEmail) {
        requireAdmin(adminEmail);

        List<Map<String, Object>> houseRows = jdbc.queryForList(HOUSE_SQL);
        List<Map<String, Object>> carRows = jdbc.queryForList(CAR_SQL);

        List<Map<String, Object>> all = new ArrayList<>(houseRows.size() + carRows.size());
        all.addAll(houseRows);
        all.addAll(carRows);

        // Newest first.
        all.sort((a, b) -> {
            Object ca = a.get("createdAt");
            Object cb = b.get("createdAt");
            if (ca instanceof Comparable && cb instanceof Comparable && ca.getClass().equals(cb.getClass())) {
                @SuppressWarnings("unchecked")
                Comparable<Object> caComp = (Comparable<Object>) ca;
                int cmp = caComp.compareTo(cb);
                if (cmp != 0) return -cmp;
            }
            return 0;
        });

        return all;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getCounts(String adminEmail) {
        requireAdmin(adminEmail);

        Long totalHouse = jdbc.queryForObject("SELECT COUNT(*) FROM bookings", Long.class);
        Long totalCar = jdbc.queryForObject("SELECT COUNT(*) FROM car_bookings", Long.class);

        long h = totalHouse != null ? totalHouse : 0L;
        long c = totalCar != null ? totalCar : 0L;

        return Map.of(
            "houseBookings", h,
            "carBookings", c,
            "totalBookings", h + c
        );
    }

    private void requireAdmin(String email) {
        if (email == null || !adminRepository.existsByEmail(email)) {
            throw new RuntimeException("Admin access required");
        }
    }
}