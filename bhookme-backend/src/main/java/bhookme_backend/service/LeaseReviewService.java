package bhookme_backend.service;

import bhookme_backend.model.User;
import bhookme_backend.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

// ============================================================
// Reviews for monthly stays & leases
// ------------------------------------------------------------
// Works like the house and car reviews (same look, same fields,
// same host moderation), but lives in its own tables so the
// existing reviews table and its JPA entity are never touched:
//   lease_reviews        - one review per tenant per lease listing
//   lease_review_images  - up to 6 photos per review
//
// Who can review: a tenant whose lease for this listing was
// CONFIRMED by the host (shown as "Verified stay"). The host can't
// review their own listing.
//
// New reviews start PENDING. The host approves / ignores / replies
// in the host dashboard's Reviews tab, next to house and car reviews.
// Only APPROVED reviews show on the lease page.
//
// Tables are created on startup with plain SQL - no manual SQL needed.
// ============================================================
@Service
public class LeaseReviewService {

    private static final Logger log = LoggerFactory.getLogger(LeaseReviewService.class);

    public static final int MAX_PHOTOS_PER_REVIEW = 6;
    private static final int MAX_REPLY_LENGTH = 2000;
    private static final Set<String> STATUSES = Set.of("PENDING", "APPROVED", "REJECTED");

    private final JdbcTemplate jdbc;
    private final UserRepository userRepository;
    private final R2StorageService r2StorageService;

    public LeaseReviewService(JdbcTemplate jdbc, UserRepository userRepository, R2StorageService r2StorageService) {
        this.jdbc = jdbc;
        this.userRepository = userRepository;
        this.r2StorageService = r2StorageService;
    }

    @PostConstruct
    void createTables() {
        try {
            jdbc.execute("CREATE TABLE IF NOT EXISTS lease_reviews ("
                    + " id BIGINT AUTO_INCREMENT PRIMARY KEY,"
                    + " lease_id BIGINT NOT NULL,"
                    + " guest_user_id BIGINT NOT NULL,"
                    + " rating TINYINT NOT NULL,"
                    + " title VARCHAR(255),"
                    + " comment TEXT,"
                    + " reviewer_display_name VARCHAR(255) NOT NULL,"
                    + " reviewer_avatar_url VARCHAR(500),"
                    + " is_verified_stay TINYINT(1) NOT NULL DEFAULT 0,"
                    + " status VARCHAR(20) NOT NULL DEFAULT 'PENDING',"
                    + " created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                    + " host_reply TEXT,"
                    + " host_replied_at DATETIME NULL,"
                    + " UNIQUE KEY uq_lease_review_guest (lease_id, guest_user_id),"
                    + " INDEX idx_lease_reviews_lease (lease_id, status)"
                    + ")");
            jdbc.execute("CREATE TABLE IF NOT EXISTS lease_review_images ("
                    + " id BIGINT AUTO_INCREMENT PRIMARY KEY,"
                    + " review_id BIGINT NOT NULL,"
                    + " image_url VARCHAR(500) NOT NULL,"
                    + " display_order INT NOT NULL DEFAULT 0,"
                    + " INDEX idx_lease_review_images_review (review_id)"
                    + ")");
        } catch (Exception e) {
            log.warn("Could not create lease review tables: {}", e.getMessage());
        }
    }

    // ------------------------------------------------------------
    // Public: approved reviews for one lease listing, newest first.
    // ------------------------------------------------------------
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getLeaseReviews(Long leaseId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList(
                "SELECT * FROM lease_reviews WHERE lease_id = ? AND status = 'APPROVED' ORDER BY created_at DESC, id DESC",
                leaseId)) {
            out.add(toResponse(r));
        }
        return out;
    }

    // ------------------------------------------------------------
    // Has the signed-in user reviewed this listing, and may they?
    //   {"hasReviewed": false, "canReview": true, "reason": null}
    // ------------------------------------------------------------
    @Transactional(readOnly = true)
    public Map<String, Object> getMyReviewStatus(String email, Long leaseId) {
        User me = findUser(email);
        Map<String, Object> lease = findLease(leaseId);

        Integer reviewed = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lease_reviews WHERE lease_id = ? AND guest_user_id = ?",
                Integer.class, leaseId, me.getId());
        boolean hasReviewed = reviewed != null && reviewed > 0;

        String reason = null;
        if (lease == null) {
            reason = "This listing could not be found.";
        } else if (toLong(lease.get("host_user_id")).equals(me.getId())) {
            reason = "You can't review your own listing.";
        } else if (!hasConfirmedLease(me.getId(), leaseId)) {
            reason = "Only tenants with a confirmed lease here can leave a review.";
        }

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("hasReviewed", hasReviewed);
        m.put("canReview", !hasReviewed && reason == null);
        m.put("reason", reason);
        return m;
    }

    // ------------------------------------------------------------
    // Tenant submits a review:
    //   {"leaseId": 3, "rating": 5, "title": "...", "comment": "...",
    //    "reviewerDisplayName": "...", "reviewerAvatarUrl": "https://..."}
    // ------------------------------------------------------------
    @Transactional
    public Map<String, Object> createReview(String email, Map<String, Object> body) {
        User me = findUser(email);
        Long leaseId = toLongOrNull(body.get("leaseId"));
        if (leaseId == null) throw new RuntimeException("A lease listing must be specified");
        Map<String, Object> lease = findLease(leaseId);
        if (lease == null) throw new RuntimeException("Lease listing not found");
        if (toLong(lease.get("host_user_id")).equals(me.getId())) {
            throw new RuntimeException("You can't review your own listing.");
        }
        if (!hasConfirmedLease(me.getId(), leaseId)) {
            throw new RuntimeException("Only tenants with a confirmed lease here can leave a review.");
        }

        String name = text(body.get("reviewerDisplayName"));
        if (name == null) throw new RuntimeException("Please enter your name");
        Integer rating = toIntOrNull(body.get("rating"));
        if (rating == null || rating < 1 || rating > 5) throw new RuntimeException("Rating must be between 1 and 5");
        String comment = text(body.get("comment"));
        if (comment == null) throw new RuntimeException("Please write a comment for your review");
        String title = text(body.get("title"));
        String avatarUrl = text(body.get("reviewerAvatarUrl"));
        if (avatarUrl != null && !r2StorageService.isOwnUrl(avatarUrl)) {
            throw new RuntimeException("Your photo must be uploaded through bhookme.");
        }

        Integer existing = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lease_reviews WHERE lease_id = ? AND guest_user_id = ?",
                Integer.class, leaseId, me.getId());
        if (existing != null && existing > 0) throw new RuntimeException("You have already reviewed this listing");

        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO lease_reviews (lease_id, guest_user_id, rating, title, comment,"
                            + " reviewer_display_name, reviewer_avatar_url, is_verified_stay, status)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'PENDING')",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, leaseId);
            ps.setLong(2, me.getId());
            ps.setInt(3, rating);
            ps.setString(4, cut(title, 255));
            ps.setString(5, comment);
            ps.setString(6, cut(name, 255));
            ps.setString(7, avatarUrl);
            return ps;
        }, keys);

        return toResponse(findReview(keys.getKey().longValue()));
    }

    // Attach already-uploaded photos to the caller's own review. {"imageUrls": [...]}
    @Transactional
    public Map<String, Object> addPhotos(String email, Long reviewId, List<String> urls) {
        User me = findUser(email);
        Map<String, Object> review = findReview(reviewId);
        if (review == null) throw new RuntimeException("Review not found");
        if (!toLong(review.get("guest_user_id")).equals(me.getId())) {
            throw new RuntimeException("You can only add photos to your own review.");
        }

        List<String> cleaned = new ArrayList<>();
        if (urls != null) {
            for (String u : urls) {
                String url = text(u);
                if (url == null) continue;
                if (!r2StorageService.isOwnUrl(url)) throw new RuntimeException("Photos must be uploaded through bhookme.");
                if (!cleaned.contains(url)) cleaned.add(url);
            }
        }
        if (cleaned.isEmpty()) return toResponse(review);

        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lease_review_images WHERE review_id = ?", Integer.class, reviewId);
        int start = count == null ? 0 : count;
        if (start + cleaned.size() > MAX_PHOTOS_PER_REVIEW) {
            throw new RuntimeException("A review can have up to " + MAX_PHOTOS_PER_REVIEW + " photos.");
        }
        for (int i = 0; i < cleaned.size(); i++) {
            jdbc.update("INSERT INTO lease_review_images (review_id, image_url, display_order) VALUES (?, ?, ?)",
                    reviewId, cleaned.get(i), start + i);
        }
        return toResponse(findReview(reviewId));
    }

    // ------------------------------------------------------------
    // Host: every review on their lease listings, any status, newest first.
    // ------------------------------------------------------------
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getHostReviews(String email) {
        User host = findUser(email);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList(
                "SELECT r.* FROM lease_reviews r JOIN leases l ON l.id = r.lease_id"
                        + " WHERE l.host_user_id = ? ORDER BY r.created_at DESC, r.id DESC",
                host.getId())) {
            out.add(toResponse(r));
        }
        return out;
    }

    // Host (or bhookme admin): approve / ignore. {"status": "APPROVED"|"REJECTED"|"PENDING"}
    @Transactional
    public Map<String, Object> moderate(String email, Long reviewId, String status) {
        Map<String, Object> review = findReview(reviewId);
        if (review == null) throw new RuntimeException("Review not found");
        if (!isAdmin(email) && !isListingHost(email, review)) {
            throw new RuntimeException("You can only moderate reviews on your own listings.");
        }
        String s = String.valueOf(status).trim().toUpperCase();
        if (!STATUSES.contains(s)) throw new RuntimeException("Status must be APPROVED, REJECTED or PENDING.");
        jdbc.update("UPDATE lease_reviews SET status = ? WHERE id = ?", s, reviewId);
        return toResponse(findReview(reviewId));
    }

    // Host's public reply under a review. Empty text removes it. {"reply": "..."}
    @Transactional
    public Map<String, Object> reply(String email, Long reviewId, String replyText) {
        Map<String, Object> review = findReview(reviewId);
        if (review == null) throw new RuntimeException("Review not found");
        if (!isListingHost(email, review)) {
            throw new RuntimeException("You can only reply to reviews on your own listings.");
        }
        String reply = replyText == null ? "" : replyText.trim();
        if (reply.length() > MAX_REPLY_LENGTH) {
            throw new RuntimeException("Replies can be up to " + MAX_REPLY_LENGTH + " characters.");
        }
        if (reply.isEmpty()) {
            jdbc.update("UPDATE lease_reviews SET host_reply = NULL, host_replied_at = NULL WHERE id = ?", reviewId);
        } else {
            jdbc.update("UPDATE lease_reviews SET host_reply = ?, host_replied_at = NOW() WHERE id = ?", reply, reviewId);
        }
        return toResponse(findReview(reviewId));
    }

    // ------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------

    // Same field names as the house/car ReviewResponse, plus leaseId,
    // leaseTitle and kind = "lease", so the same screens can show it.
    private Map<String, Object> toResponse(Map<String, Object> r) {
        Long id = toLong(r.get("id"));
        Long leaseId = toLong(r.get("lease_id"));
        Map<String, Object> lease = findLease(leaseId);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("kind", "lease");
        m.put("leaseId", leaseId);
        m.put("leaseTitle", lease == null ? "Deleted listing" : lease.get("title"));
        m.put("rating", toIntOrNull(r.get("rating")));
        m.put("title", r.get("title"));
        m.put("comment", r.get("comment"));
        m.put("reviewerDisplayName", r.get("reviewer_display_name"));
        m.put("reviewerAvatarUrl", r.get("reviewer_avatar_url"));
        m.put("isVerifiedStay", isTrue(r.get("is_verified_stay")));
        m.put("status", r.get("status"));
        m.put("createdAt", iso(r.get("created_at")));
        m.put("hostReply", r.get("host_reply"));
        m.put("hostRepliedAt", iso(r.get("host_replied_at")));
        m.put("imageUrls", jdbc.queryForList(
                "SELECT image_url FROM lease_review_images WHERE review_id = ? ORDER BY display_order, id",
                String.class, id));
        return m;
    }

    private boolean hasConfirmedLease(Long userId, Long leaseId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lease_applications WHERE lease_id = ? AND tenant_user_id = ?"
                        + " AND status = 'APPROVED' AND confirmed = 1",
                Integer.class, leaseId, userId);
        return n != null && n > 0;
    }

    private boolean isListingHost(String email, Map<String, Object> review) {
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) return false;
        Map<String, Object> lease = findLease(toLong(review.get("lease_id")));
        return lease != null && toLong(lease.get("host_user_id")).equals(user.getId());
    }

    private boolean isAdmin(String email) {
        try {
            Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM admins WHERE email = ? AND is_active = 1", Integer.class, email);
            return count != null && count > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private Map<String, Object> findLease(Long id) {
        if (id == null) return null;
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM leases WHERE id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Map<String, Object> findReview(Long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM lease_reviews WHERE id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private User findUser(String email) {
        if (email == null) throw new RuntimeException("Please log in.");
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("Account not found"));
    }

    // "2026-10-08T14:30:00" - the same format the house/car reviews send.
    private static String iso(Object value) {
        if (value == null) return null;
        if (value instanceof LocalDateTime t) return t.toString();
        if (value instanceof Timestamp t) return t.toLocalDateTime().toString();
        return value.toString().replace(' ', 'T');
    }

    private static String text(Object value) {
        if (value == null) return null;
        String s = value.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private static String cut(String s, int max) {
        return s == null ? null : (s.length() > max ? s.substring(0, max) : s);
    }

    private static boolean isTrue(Object value) {
        if (value == null) return false;
        if (value instanceof Boolean b) return b;
        if (value instanceof Number n) return n.intValue() != 0;
        return "true".equalsIgnoreCase(value.toString()) || "1".equals(value.toString());
    }

    private static Long toLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.longValue();
        return Long.valueOf(value.toString());
    }

    private static Long toLongOrNull(Object value) {
        try {
            return value == null ? null : Long.valueOf(value.toString().trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static Integer toIntOrNull(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.valueOf(value.toString().trim());
        } catch (Exception e) {
            return null;
        }
    }
}