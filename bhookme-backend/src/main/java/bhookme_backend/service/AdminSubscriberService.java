package bhookme_backend.service;

import bhookme_backend.dto.AdminSubscriberResponse;
import bhookme_backend.repository.AdminRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Admin-side read/write access to the newsletter_subscribers table.
 *
 * Uses JdbcTemplate rather than a JPA entity, matching how
 * SupportController already writes to this table. That keeps the
 * schema and the code from drifting apart - the entity version we
 * tried earlier never worked because it expected different columns.
 *
 * Every method calls requireAdmin(adminEmail) first, which throws if
 * the caller's email isn't in the admins table. Same pattern as
 * AdminUserService.
 */
@Service
public class AdminSubscriberService {

    private final JdbcTemplate jdbc;
    private final AdminRepository adminRepository;

    public AdminSubscriberService(JdbcTemplate jdbc, AdminRepository adminRepository) {
        this.jdbc = jdbc;
        this.adminRepository = adminRepository;
    }

    /**
     * Every subscriber, newest first.
     */
    @Transactional(readOnly = true)
    public List<AdminSubscriberResponse> getAllSubscribers(String adminEmail) {
        requireAdmin(adminEmail);

        String sql = "SELECT id, email, status, subscribed_at, unsubscribed_at " +
                     "FROM newsletter_subscribers ORDER BY subscribed_at DESC, id DESC";

        return jdbc.query(sql, (rs, rowNum) -> {
            AdminSubscriberResponse r = new AdminSubscriberResponse();
            r.setId(rs.getLong("id"));
            r.setEmail(rs.getString("email"));
            r.setStatus(rs.getString("status"));
            Timestamp sub = rs.getTimestamp("subscribed_at");
            r.setSubscribedAt(sub != null ? sub.toLocalDateTime() : null);
            Timestamp unsub = rs.getTimestamp("unsubscribed_at");
            r.setUnsubscribedAt(unsub != null ? unsub.toLocalDateTime() : null);
            return r;
        });
    }

    /**
     * Total number of subscribers (all statuses).
     */
    @Transactional(readOnly = true)
    public long getCount(String adminEmail) {
        requireAdmin(adminEmail);
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM newsletter_subscribers", Long.class);
        return count != null ? count : 0L;
    }

    /**
     * Hard delete by id. Returns false if no row matched.
     */
    @Transactional
    public boolean deleteSubscriber(String adminEmail, Long id) {
        requireAdmin(adminEmail);
        int rows = jdbc.update("DELETE FROM newsletter_subscribers WHERE id = ?", id);
        return rows > 0;
    }

    /**
     * Flip a subscriber's status between ACTIVE and UNSUBSCRIBED.
     * Stamps unsubscribed_at when moving to UNSUBSCRIBED, clears it
     * when moving back.
     */
    @Transactional
    public AdminSubscriberResponse toggleStatus(String adminEmail, Long id) {
        requireAdmin(adminEmail);

        // Read current row
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, email, status, subscribed_at, unsubscribed_at " +
                "FROM newsletter_subscribers WHERE id = ?", id);

        if (rows.isEmpty()) {
            throw new RuntimeException("Subscriber not found");
        }

        Map<String, Object> row = rows.get(0);
        String currentStatus = String.valueOf(row.get("status"));
        String nextStatus = "ACTIVE".equalsIgnoreCase(currentStatus) ? "UNSUBSCRIBED" : "ACTIVE";

        if ("ACTIVE".equals(nextStatus)) {
            jdbc.update(
                    "UPDATE newsletter_subscribers SET status = ?, unsubscribed_at = NULL WHERE id = ?",
                    nextStatus, id);
        } else {
            jdbc.update(
                    "UPDATE newsletter_subscribers SET status = ?, unsubscribed_at = ? WHERE id = ?",
                    nextStatus, LocalDateTime.now(), id);
        }

        AdminSubscriberResponse r = new AdminSubscriberResponse();
        r.setId(id);
        r.setEmail(String.valueOf(row.get("email")));
        r.setStatus(nextStatus);
        Object sub = row.get("subscribed_at");
        if (sub instanceof Timestamp) {
            r.setSubscribedAt(((Timestamp) sub).toLocalDateTime());
        }
        if ("ACTIVE".equals(nextStatus)) {
            r.setUnsubscribedAt(null);
        } else {
            r.setUnsubscribedAt(LocalDateTime.now());
        }
        return r;
    }

    private void requireAdmin(String email) {
        if (email == null || !adminRepository.existsByEmail(email)) {
            throw new RuntimeException("Admin access required");
        }
    }
}
