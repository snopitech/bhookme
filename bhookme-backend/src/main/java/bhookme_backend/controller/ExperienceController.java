package bhookme_backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.*;

// Experiences: hosted activities booked per person, per time slot.
//
// Host (logged in, must be a host):
//   GET    /api/experiences/mine                    my experiences + upcoming slots
//   POST   /api/experiences                         create (optional "imageUrls": ["https://..."])
//   PUT    /api/experiences/{id}                    edit
//   PUT    /api/experiences/{id}/status             {"status":"ACTIVE"|"PAUSED"}
//   DELETE /api/experiences/{id}                    delete (only if nobody has booked)
//   POST   /api/experiences/{id}/slots              {"startTime":"2026-10-10T14:00","capacity":8}
//   DELETE /api/experiences/{id}/slots/{slotId}     remove a slot (only if nobody has booked it)
//
// Public:
//   GET /api/experiences?location=&category=&date=2026-10-10&guests=2
//   GET /api/experiences/{id}
@RestController
@RequestMapping("/api/experiences")
public class ExperienceController {

    public static final List<String> CATEGORIES = List.of(
        "food-drink", "tours", "art-culture", "nature-outdoors", "wellness", "nightlife", "sports", "classes");

    private final JdbcTemplate jdbc;

    public ExperienceController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final String EXPERIENCE_SELECT =
        "SELECT e.id, e.host_user_id AS hostUserId, e.title, e.category, e.description, " +
        "       e.what_you_will_do AS whatYouWillDo, e.whats_included AS whatsIncluded, " +
        "       e.city, e.state, e.meeting_point AS meetingPoint, e.latitude, e.longitude, " +
        "       e.duration_minutes AS durationMinutes, e.price_per_person AS pricePerPerson, " +
        "       e.max_guests AS maxGuests, e.language, e.status, " +
        "       DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt, " +
        "       u.first_name AS hostFirstName, " +
        "       (SELECT ei.image_url FROM experience_images ei WHERE ei.experience_id = e.id " +
        "         ORDER BY ei.display_order, ei.id LIMIT 1) AS imageUrl, " +
        "       (SELECT DATE_FORMAT(MIN(s.start_time), '%Y-%m-%dT%H:%i:%s') FROM experience_slots s " +
        "         WHERE s.experience_id = e.id AND s.status = 'OPEN' AND s.start_time > NOW() " +
        "           AND s.booked_count < s.capacity) AS nextSlot " +
        "FROM experiences e LEFT JOIN users u ON u.id = e.host_user_id";

    private static final String SLOT_SELECT =
        "SELECT id, DATE_FORMAT(start_time, '%Y-%m-%dT%H:%i:%s') AS startTime, capacity, " +
        "       booked_count AS bookedCount, (capacity - booked_count) AS spotsLeft, status " +
        "FROM experience_slots";

    // ======================= PUBLIC =======================

    @GetMapping
    public ResponseEntity<?> browse(@RequestParam(required = false) String location,
                                    @RequestParam(required = false) String category,
                                    @RequestParam(required = false) String date,
                                    @RequestParam(required = false) Integer guests) {
        try {
            StringBuilder sql = new StringBuilder(EXPERIENCE_SELECT + " WHERE e.status = 'ACTIVE'");
            List<Object> args = new ArrayList<>();

            if (category != null && !category.isBlank()) {
                sql.append(" AND e.category = ?");
                args.add(category.trim());
            }
            if (location != null && !location.isBlank()) {
                for (String part : location.split(",")) {
                    String t = part.trim();
                    if (t.isEmpty()) continue;
                    sql.append(" AND (e.city LIKE ? OR e.state LIKE ? OR e.title LIKE ?)");
                    String like = "%" + t + "%";
                    args.add(like); args.add(like); args.add(like);
                }
            }
            int need = (guests != null && guests > 0) ? guests : 1;
            if (guests != null && guests > 0) {
                sql.append(" AND e.max_guests >= ?");
                args.add(guests);
            }
            // Only experiences with a bookable slot (on the chosen day, if one was picked).
            sql.append(" AND EXISTS (SELECT 1 FROM experience_slots s WHERE s.experience_id = e.id" +
                       " AND s.status = 'OPEN' AND s.start_time > NOW() AND (s.capacity - s.booked_count) >= ?");
            args.add(need);
            if (date != null && !date.isBlank()) {
                LocalDate day = LocalDate.parse(date.trim());
                sql.append(" AND DATE(s.start_time) = ?");
                args.add(java.sql.Date.valueOf(day));
            }
            sql.append(") ORDER BY e.created_at DESC");

            return ResponseEntity.ok(jdbc.queryForList(sql.toString(), args.toArray()));
        } catch (DateTimeParseException e) {
            return error("Dates must look like 2026-10-01.");
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable Long id) {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                EXPERIENCE_SELECT + " WHERE e.id = ? AND e.status = 'ACTIVE'", id);
            if (rows.isEmpty()) throw new RuntimeException("Experience not found.");
            Map<String, Object> exp = rows.get(0);
            exp.put("images", jdbc.queryForList(
                "SELECT id, image_url AS imageUrl FROM experience_images WHERE experience_id = ? " +
                "ORDER BY display_order, id", id));
            exp.put("slots", jdbc.queryForList(
                SLOT_SELECT + " WHERE experience_id = ? AND status = 'OPEN' AND start_time > NOW() " +
                "AND booked_count < capacity ORDER BY start_time LIMIT 60", id));
            return ResponseEntity.ok(exp);
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    // ======================= HOST =======================

    @GetMapping("/mine")
    public ResponseEntity<?> mine(Authentication authentication) {
        try {
            Long hostId = requireHost(authentication);
            List<Map<String, Object>> list = jdbc.queryForList(
                EXPERIENCE_SELECT + " WHERE e.host_user_id = ? ORDER BY e.created_at DESC", hostId);
            for (Map<String, Object> exp : list) {
                exp.put("slots", jdbc.queryForList(
                    SLOT_SELECT + " WHERE experience_id = ? AND start_time > NOW() ORDER BY start_time",
                    exp.get("id")));
                exp.put("imageUrls", imageList(exp.get("id")));
            }
            return ResponseEntity.ok(list);
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    @PostMapping
    public ResponseEntity<?> create(Authentication authentication, @RequestBody Map<String, Object> body) {
        try {
            Long hostId = requireHost(authentication);
            Map<String, Object> v = validate(body);

            KeyHolder keys = new GeneratedKeyHolder();
            jdbc.update(con -> {
                PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO experiences (host_user_id, title, category, description, what_you_will_do, " +
                    "whats_included, city, state, meeting_point, latitude, longitude, duration_minutes, " +
                    "price_per_person, max_guests, language, status) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')",
                    Statement.RETURN_GENERATED_KEYS);
                ps.setLong(1, hostId);
                int i = 2;
                for (String f : FIELD_ORDER) ps.setObject(i++, v.get(f));
                return ps;
            }, keys);

            Long id = keys.getKey().longValue();
            replaceImages(id, imageUrls(body));
            return ResponseEntity.ok(ownedExperience(id, hostId));
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(Authentication authentication, @PathVariable Long id,
                                    @RequestBody Map<String, Object> body) {
        try {
            Long hostId = requireHost(authentication);
            requireOwner(id, hostId);
            Map<String, Object> v = validate(body);

            List<Object> args = new ArrayList<>();
            for (String f : FIELD_ORDER) args.add(v.get(f));
            args.add(id);
            jdbc.update(
                "UPDATE experiences SET title = ?, category = ?, description = ?, what_you_will_do = ?, " +
                "whats_included = ?, city = ?, state = ?, meeting_point = ?, latitude = ?, longitude = ?, " +
                "duration_minutes = ?, price_per_person = ?, max_guests = ?, language = ?, updated_at = NOW() " +
                "WHERE id = ?", args.toArray());
            if (body.containsKey("imageUrls")) replaceImages(id, imageUrls(body));
            return ResponseEntity.ok(ownedExperience(id, hostId));
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<?> setStatus(Authentication authentication, @PathVariable Long id,
                                       @RequestBody Map<String, Object> body) {
        try {
            Long hostId = requireHost(authentication);
            requireOwner(id, hostId);
            String status = String.valueOf(body.get("status")).trim().toUpperCase();
            if (!status.equals("ACTIVE") && !status.equals("PAUSED")) {
                throw new RuntimeException("Status must be ACTIVE or PAUSED.");
            }
            jdbc.update("UPDATE experiences SET status = ?, updated_at = NOW() WHERE id = ?", status, id);
            return ResponseEntity.ok(ownedExperience(id, hostId));
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(Authentication authentication, @PathVariable Long id) {
        try {
            Long hostId = requireHost(authentication);
            requireOwner(id, hostId);
            Integer booked = jdbc.queryForObject(
                "SELECT COALESCE(SUM(booked_count), 0) FROM experience_slots WHERE experience_id = ?",
                Integer.class, id);
            if (booked != null && booked > 0) {
                throw new RuntimeException("Guests have booked this experience. Pause it instead of deleting.");
            }
            jdbc.update("DELETE FROM experiences WHERE id = ?", id);
            return ResponseEntity.ok(Map.of("deleted", id));
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    @PostMapping("/{id}/slots")
    public ResponseEntity<?> addSlot(Authentication authentication, @PathVariable Long id,
                                     @RequestBody Map<String, Object> body) {
        try {
            Long hostId = requireHost(authentication);
            Map<String, Object> exp = requireOwner(id, hostId);

            String raw = text(body.get("startTime"));
            if (raw == null) throw new RuntimeException("Pick a date and start time.");
            LocalDateTime start;
            try {
                start = LocalDateTime.parse(raw.length() == 16 ? raw + ":00" : raw);
            } catch (DateTimeParseException e) {
                throw new RuntimeException("Start time must look like 2026-10-10T14:00.");
            }
            if (!start.isAfter(LocalDateTime.now())) throw new RuntimeException("Start time must be in the future.");

            int maxGuests = ((Number) exp.get("max_guests")).intValue();
            Integer capacity = intOrNull(body.get("capacity"));
            if (capacity == null) capacity = maxGuests;
            if (capacity < 1 || capacity > maxGuests) {
                throw new RuntimeException("Spots must be between 1 and " + maxGuests + ".");
            }

            Integer clash = jdbc.queryForObject(
                "SELECT COUNT(*) FROM experience_slots WHERE experience_id = ? AND start_time = ?",
                Integer.class, id, Timestamp.valueOf(start));
            if (clash != null && clash > 0) throw new RuntimeException("You already have a slot at that time.");

            jdbc.update("INSERT INTO experience_slots (experience_id, start_time, capacity) VALUES (?, ?, ?)",
                id, Timestamp.valueOf(start), capacity);
            return ResponseEntity.ok(jdbc.queryForList(
                SLOT_SELECT + " WHERE experience_id = ? AND start_time > NOW() ORDER BY start_time", id));
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    @DeleteMapping("/{id}/slots/{slotId}")
    public ResponseEntity<?> deleteSlot(Authentication authentication, @PathVariable Long id,
                                        @PathVariable Long slotId) {
        try {
            Long hostId = requireHost(authentication);
            requireOwner(id, hostId);
            List<Map<String, Object>> slot = jdbc.queryForList(
                "SELECT booked_count FROM experience_slots WHERE id = ? AND experience_id = ?", slotId, id);
            if (slot.isEmpty()) throw new RuntimeException("Slot not found.");
            if (((Number) slot.get(0).get("booked_count")).intValue() > 0) {
                throw new RuntimeException("Guests have booked this slot, so it can't be removed.");
            }
            jdbc.update("DELETE FROM experience_slots WHERE id = ?", slotId);
            return ResponseEntity.ok(jdbc.queryForList(
                SLOT_SELECT + " WHERE experience_id = ? AND start_time > NOW() ORDER BY start_time", id));
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    // ======================= HELPERS =======================

    // Insert/update column order (after host_user_id).
    private static final List<String> FIELD_ORDER = List.of(
        "title", "category", "description", "whatYouWillDo", "whatsIncluded", "city", "state",
        "meetingPoint", "latitude", "longitude", "durationMinutes", "pricePerPerson", "maxGuests", "language");

    private Map<String, Object> validate(Map<String, Object> b) {
        Map<String, Object> v = new HashMap<>();

        String title = text(b.get("title"));
        if (title == null || title.length() < 5) throw new RuntimeException("Give your experience a title (at least 5 characters).");
        if (title.length() > 150) throw new RuntimeException("Title is too long (150 characters max).");
        v.put("title", title);

        String category = text(b.get("category"));
        if (category == null || !CATEGORIES.contains(category)) throw new RuntimeException("Pick a category.");
        v.put("category", category);

        String city = text(b.get("city"));
        if (city == null) throw new RuntimeException("Enter the city where it takes place.");
        v.put("city", city);

        Integer duration = intOrNull(b.get("durationMinutes"));
        if (duration == null || duration < 15 || duration > 24 * 60) {
            throw new RuntimeException("Duration must be between 15 minutes and 24 hours.");
        }
        v.put("durationMinutes", duration);

        BigDecimal price = decimalOrNull(b.get("pricePerPerson"));
        if (price == null || price.compareTo(BigDecimal.ONE) < 0) throw new RuntimeException("Price per person must be at least $1.");
        v.put("pricePerPerson", price);

        Integer maxGuests = intOrNull(b.get("maxGuests"));
        if (maxGuests == null || maxGuests < 1 || maxGuests > 100) throw new RuntimeException("Group size must be between 1 and 100.");
        v.put("maxGuests", maxGuests);

        v.put("description", text(b.get("description")));
        v.put("whatYouWillDo", text(b.get("whatYouWillDo")));
        v.put("whatsIncluded", text(b.get("whatsIncluded")));
        v.put("state", text(b.get("state")));
        v.put("meetingPoint", text(b.get("meetingPoint")));
        v.put("latitude", decimalOrNull(b.get("latitude")));
        v.put("longitude", decimalOrNull(b.get("longitude")));
        String language = text(b.get("language"));
        v.put("language", language != null ? language : "English");
        return v;
    }

    // Works whether the login token identifies the user by email or by id.
    private Long requireHost(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            throw new RuntimeException("Please log in.");
        }
        String who = authentication.getName();
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id, is_host FROM users WHERE email = ?", who);
        if (rows.isEmpty() && who.matches("\\d+")) {
            rows = jdbc.queryForList("SELECT id, is_host FROM users WHERE id = ?", Long.valueOf(who));
        }
        if (rows.isEmpty()) throw new RuntimeException("Account not found.");
        Object isHost = rows.get(0).get("is_host");
        boolean host = Boolean.TRUE.equals(isHost) || (isHost instanceof Number && ((Number) isHost).intValue() == 1);
        if (!host) throw new RuntimeException("Only hosts can create experiences. Apply to become a host first.");
        return ((Number) rows.get(0).get("id")).longValue();
    }

    private Map<String, Object> requireOwner(Long experienceId, Long hostId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT * FROM experiences WHERE id = ? AND host_user_id = ?", experienceId, hostId);
        if (rows.isEmpty()) throw new RuntimeException("Experience not found.");
        return rows.get(0);
    }

    private Map<String, Object> ownedExperience(Long id, Long hostId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            EXPERIENCE_SELECT + " WHERE e.id = ? AND e.host_user_id = ?", id, hostId);
        if (rows.isEmpty()) throw new RuntimeException("Experience not found.");
        Map<String, Object> exp = rows.get(0);
        exp.put("slots", jdbc.queryForList(
            SLOT_SELECT + " WHERE experience_id = ? AND start_time > NOW() ORDER BY start_time", id));
        exp.put("imageUrls", imageList(id));
        return exp;
    }

    // Photo links sent by the host: up to 10, each must be a full http(s) link.
    private List<String> imageUrls(Map<String, Object> body) {
        List<String> urls = new ArrayList<>();
        Object raw = body.get("imageUrls");
        if (!(raw instanceof List)) return urls;
        for (Object o : (List<?>) raw) {
            String u = text(o);
            if (u == null) continue;
            if (!u.matches("(?i)^https?://\\S+$")) {
                throw new RuntimeException("Photo links must start with http:// or https:// (" + u + ").");
            }
            if (u.length() > 500) throw new RuntimeException("One of the photo links is too long.");
            if (!urls.contains(u)) urls.add(u);
        }
        if (urls.size() > 10) throw new RuntimeException("You can add up to 10 photos.");
        return urls;
    }

    private void replaceImages(Long experienceId, List<String> urls) {
        jdbc.update("DELETE FROM experience_images WHERE experience_id = ?", experienceId);
        for (int i = 0; i < urls.size(); i++) {
            jdbc.update("INSERT INTO experience_images (experience_id, image_url, display_order) VALUES (?, ?, ?)",
                experienceId, urls.get(i), i);
        }
    }

    private List<String> imageList(Object experienceId) {
        return jdbc.queryForList(
            "SELECT image_url FROM experience_images WHERE experience_id = ? ORDER BY display_order, id",
            String.class, experienceId);
    }

    private String text(Object value) {
        if (value == null) return null;
        String s = value.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private Integer intOrNull(Object value) {
        String s = text(value);
        if (s == null) return null;
        try { return new BigDecimal(s).intValueExact(); } catch (Exception e) { return null; }
    }

    private BigDecimal decimalOrNull(Object value) {
        String s = text(value);
        if (s == null) return null;
        try { return new BigDecimal(s); } catch (Exception e) { return null; }
    }

    private String rootMessage(RuntimeException e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        return root.getMessage() != null ? root.getMessage() : e.getMessage();
    }

    private ResponseEntity<?> error(String message) {
        Map<String, String> body = new HashMap<>();
        body.put("message", message);
        return ResponseEntity.badRequest().body(body);
    }
}