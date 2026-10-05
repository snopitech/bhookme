package bhookme_backend.controller;

import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.sql.Date;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Pattern;

// Public search for the header search bar on bhookme-dashboard.
//   GET /api/properties/search?location=Houston, TX&checkIn=2026-10-10&checkOut=2026-10-13&guests=3
//   GET /api/properties/search/locations   -> ["Conroe, TX", "Houston, TX", ...]
//   GET /api/properties/search/cars?location=Houston&checkIn=2026-10-10&checkOut=2026-10-13
//       -> rentable cars (car_rentals) for the Services page, first photo attached as image
//   GET /api/properties/search/all?q=toyota houston
//       -> Explore page: homes, cars, experiences and places matching every word
@RestController
@RequestMapping("/api/properties/search")
public class PropertySearchController {

    private final JdbcTemplate jdbc;

    // Columns that describe where a property is (matched by name, whatever the exact column is called).
    private static final Pattern LOCATION_KEY =
        Pattern.compile("(?i).*(city|state|country|address|zip|postal|neighbo(u)?rhood|region|county|location).*");
    // Column that holds how many guests a property fits.
    private static final Pattern CAPACITY_KEY =
        Pattern.compile("(?i).*(max_guest|guest|accommodat|capacity|sleeps).*");

    public PropertySearchController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public ResponseEntity<?> search(@RequestParam(required = false) String location,
                                    @RequestParam(required = false) String checkIn,
                                    @RequestParam(required = false) String checkOut,
                                    @RequestParam(required = false) Integer guests) {
        try {
            LocalDate in = parseDate(checkIn);
            LocalDate out = parseDate(checkOut);
            if (in != null && out != null && !out.isAfter(in)) {
                throw new RuntimeException("Check-out must be after check-in.");
            }

            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT p.* FROM properties p WHERE p.status = 'ACTIVE' ORDER BY p.id DESC");

            Set<String> booked = (in != null && out != null) ? bookedPropertyIds(in, out) : Collections.emptySet();
            List<String> tokens = locationTokens(location);

            List<Map<String, Object>> results = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                if (booked.contains(String.valueOf(row.get("id")))) continue;
                if (guests != null && guests > 0) {
                    Integer capacity = capacityOf(row);
                    if (capacity != null && capacity < guests) continue;
                }
                if (!tokens.isEmpty() && !matchesLocation(row, tokens)) continue;
                results.add(row);
            }

            attachFirstImages(results);
            return ResponseEntity.ok(results);
        } catch (DateTimeParseException e) {
            return error("Dates must look like 2026-10-01.");
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    @GetMapping("/locations")
    public ResponseEntity<?> locations() {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT p.* FROM properties p WHERE p.status = 'ACTIVE'");
            TreeSet<String> labels = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
            for (Map<String, Object> row : rows) {
                String city = text(row.get("city"));
                if (city == null) continue;
                String state = firstText(row, "state", "state_code", "region", "country");
                labels.add(state != null ? city + ", " + state : city);
            }
            return ResponseEntity.ok(new ArrayList<>(labels));
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    @GetMapping("/cars")
    public ResponseEntity<?> cars(@RequestParam(required = false) String location,
                                  @RequestParam(required = false) String checkIn,
                                  @RequestParam(required = false) String checkOut) {
        try {
            LocalDate in = parseDate(checkIn);
            LocalDate out = parseDate(checkOut);
            if (in != null && out != null && !out.isAfter(in)) {
                throw new RuntimeException("Return date must be after pick-up date.");
            }

            List<String> carColumns = columnsOf("car_rentals");
            String where = carColumns.contains("status")
                ? " WHERE c.status IS NULL OR UPPER(c.status) NOT IN " +
                  "('INACTIVE','DELETED','REJECTED','PENDING','SUSPENDED','DRAFT','ARCHIVED','DISABLED')"
                : "";
            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT c.* FROM car_rentals c" + where + " ORDER BY c.id DESC");

            Set<String> booked = (in != null && out != null) ? bookedCarIds(in, out) : Collections.emptySet();
            List<String> tokens = locationTokens(location);

            List<Map<String, Object>> results = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                if (booked.contains(String.valueOf(row.get("id")))) continue;
                if (!tokens.isEmpty() && !matchesLocation(row, tokens)) continue;
                results.add(row);
            }

            attachFirstCarImages(results);
            return ResponseEntity.ok(results);
        } catch (DateTimeParseException e) {
            return error("Dates must look like 2026-10-01.");
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    // Explore page: one search box across the whole app. Every word in q must
    // match the item somewhere (so "toyota houston" = Toyotas in Houston).
    // Items whose title/name contains the words rank first.
    private static final int EXPLORE_LIMIT = 24;

    @GetMapping("/all")
    public ResponseEntity<?> searchAll(@RequestParam(required = false) String q) {
        try {
            List<String> words = new ArrayList<>();
            if (q != null) {
                for (String w : q.toLowerCase().split("[\\s,]+")) {
                    if (!w.isBlank()) words.add(w.trim());
                }
            }

            Map<String, Object> result = new HashMap<>();
            result.put("query", q == null ? "" : q.trim());
            if (words.isEmpty()) {
                result.put("homes", List.of());
                result.put("cars", List.of());
                result.put("experiences", List.of());
                result.put("places", List.of());
                result.put("counts", Map.of("homes", 0, "cars", 0, "experiences", 0, "places", 0));
                return ResponseEntity.ok(result);
            }

            // Homes
            List<Map<String, Object>> homes = rank(
                    jdbc.queryForList("SELECT p.* FROM properties p WHERE p.status = 'ACTIVE'"),
                    words, new String[] {"title"},
                    new String[] {"title", "description", "city", "state", "property_type", "category", "zip_code"});
            int homeCount = homes.size();
            homes = new ArrayList<>(homes.subList(0, Math.min(EXPLORE_LIMIT, homes.size())));
            attachFirstImages(homes);

            // Cars
            List<Map<String, Object>> cars = rank(
                    jdbc.queryForList("SELECT c.* FROM car_rentals c WHERE c.status IS NULL OR c.status = 'ACTIVE'"),
                    words, new String[] {"make", "model"},
                    new String[] {"make", "model", "category", "city", "state", "year"});
            int carCount = cars.size();
            cars = new ArrayList<>(cars.subList(0, Math.min(EXPLORE_LIMIT, cars.size())));
            attachFirstCarImages(cars);

            // Experiences (skipped quietly if the table isn't there yet)
            List<Map<String, Object>> experiences = new ArrayList<>();
            try {
                experiences = rank(
                        jdbc.queryForList(
                                "SELECT e.*, (SELECT ei.image_url FROM experience_images ei WHERE ei.experience_id = e.id " +
                                "ORDER BY ei.display_order, ei.id LIMIT 1) AS cover_image " +
                                "FROM experiences e WHERE e.status = 'ACTIVE'"),
                        words, new String[] {"title"},
                        new String[] {"title", "category", "city", "state", "description", "what_you_will_do"});
            } catch (DataAccessException ignored) {
                // experiences tables not created yet
            }
            int experienceCount = experiences.size();
            experiences = new ArrayList<>(experiences.subList(0, Math.min(EXPLORE_LIMIT, experiences.size())));

            // Places: distinct "City, State" across homes and cars.
            java.util.TreeMap<String, Integer> placeCounts = new java.util.TreeMap<>(String.CASE_INSENSITIVE_ORDER);
            List<Map<String, Object>> allPlaces = new ArrayList<>();
            allPlaces.addAll(jdbc.queryForList("SELECT city, state FROM properties WHERE status = 'ACTIVE'"));
            allPlaces.addAll(jdbc.queryForList("SELECT city, state FROM car_rentals WHERE status IS NULL OR status = 'ACTIVE'"));
            for (Map<String, Object> row : allPlaces) {
                String city = text(row.get("city"));
                if (city == null) continue;
                String state = text(row.get("state"));
                String label = state != null ? city + ", " + state : city;
                String hay = label.toLowerCase();
                boolean all = true;
                for (String w : words) {
                    if (!hay.contains(w)) { all = false; break; }
                }
                if (all) placeCounts.merge(label, 1, Integer::sum);
            }
            List<Map<String, Object>> places = new ArrayList<>();
            for (Map.Entry<String, Integer> e : placeCounts.entrySet()) {
                Map<String, Object> place = new HashMap<>();
                place.put("label", e.getKey());
                place.put("listings", e.getValue());
                places.add(place);
            }

            Map<String, Object> counts = new HashMap<>();
            counts.put("homes", homeCount);
            counts.put("cars", carCount);
            counts.put("experiences", experienceCount);
            counts.put("places", places.size());

            result.put("homes", homes);
            result.put("cars", cars);
            result.put("experiences", experiences);
            result.put("places", places);
            result.put("counts", counts);
            return ResponseEntity.ok(result);
        } catch (RuntimeException e) {
            return error(rootMessage(e));
        }
    }

    // Keeps rows where every word appears in at least one of searchKeys,
    // ranked by how many words appear in the titleKeys.
    private List<Map<String, Object>> rank(List<Map<String, Object>> rows, List<String> words,
                                           String[] titleKeys, String[] searchKeys) {
        List<Map<String, Object>> matched = new ArrayList<>();
        Map<Map<String, Object>, Integer> scores = new java.util.IdentityHashMap<>();
        for (Map<String, Object> row : rows) {
            String hay = joinValues(row, searchKeys);
            boolean all = true;
            for (String w : words) {
                if (!hay.contains(w)) { all = false; break; }
            }
            if (!all) continue;
            String title = joinValues(row, titleKeys);
            int score = 0;
            for (String w : words) {
                if (title.contains(w)) score++;
            }
            scores.put(row, score);
            matched.add(row);
        }
        matched.sort((a, b) -> Integer.compare(scores.get(b), scores.get(a)));
        return matched;
    }

    private String joinValues(Map<String, Object> row, String[] keys) {
        StringBuilder sb = new StringBuilder();
        for (String k : keys) {
            Object v = row.get(k);
            if (v != null) sb.append(' ').append(v.toString().toLowerCase());
        }
        return sb.toString();
    }

    // ---------- helpers ----------

    private List<String> columnsOf(String table) {
        List<String> cols = jdbc.queryForList(
            "SELECT column_name FROM information_schema.columns " +
            "WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position",
            String.class, table);
        List<String> lower = new ArrayList<>();
        for (String c : cols) lower.add(c.toLowerCase());
        return lower;
    }

    private Set<String> bookedCarIds(LocalDate in, LocalDate out) {
        String overlap = "SELECT DISTINCT car_id FROM car_bookings WHERE start_date < ? AND end_date > ?";
        List<Long> ids;
        try {
            ids = jdbc.queryForList(overlap +
                " AND UPPER(status) NOT IN ('CANCELLED','CANCELED','REJECTED','REFUNDED','DECLINED','EXPIRED')",
                Long.class, Date.valueOf(out), Date.valueOf(in));
        } catch (DataAccessException e) {
            ids = jdbc.queryForList(overlap, Long.class, Date.valueOf(out), Date.valueOf(in));
        }
        Set<String> set = new HashSet<>();
        for (Long id : ids) set.add(String.valueOf(id));
        return set;
    }

    // Finds the car photos table (e.g. car_images / car_rental_images / car_photos)
    // and attaches each car's first photo. Does nothing if there is no such table.
    private void attachFirstCarImages(List<Map<String, Object>> cars) {
        if (cars.isEmpty()) return;
        List<String> tables = jdbc.queryForList(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() " +
            "AND (table_name LIKE '%car%image%' OR table_name LIKE '%car%photo%') ORDER BY table_name",
            String.class);
        if (tables.isEmpty()) return;

        String table = tables.get(0);
        List<String> cols = columnsOf(table);
        String fk = null;
        for (String candidate : new String[] {"car_id", "car_rental_id", "car_rentals_id", "rental_id"}) {
            if (cols.contains(candidate)) { fk = candidate; break; }
        }
        if (fk == null) return;
        String order = cols.contains("display_order") ? "display_order"
                     : cols.contains("sort_order") ? "sort_order"
                     : cols.contains("position") ? "position" : "id";

        Map<String, Map<String, Object>> first = new HashMap<>();
        for (Map<String, Object> img : jdbc.queryForList(
                "SELECT * FROM `" + table + "` ORDER BY `" + fk + "`, `" + order + "`")) {
            first.putIfAbsent(String.valueOf(img.get(fk)), img);
        }
        for (Map<String, Object> car : cars) {
            Map<String, Object> img = first.get(String.valueOf(car.get("id")));
            if (img != null) car.put("image", img);
        }
    }

    private Set<String> bookedPropertyIds(LocalDate in, LocalDate out) {
        // A booking overlaps when it starts before our check-out and ends after our check-in.
        String overlap = "SELECT DISTINCT property_id FROM bookings " +
                         "WHERE check_in_date < ? AND check_out_date > ?";
        List<Long> ids;
        try {
            ids = jdbc.queryForList(overlap +
                " AND UPPER(status) NOT IN ('CANCELLED','CANCELED','REJECTED','REFUNDED','DECLINED','EXPIRED')",
                Long.class, Date.valueOf(out), Date.valueOf(in));
        } catch (DataAccessException e) {
            // bookings has no status column: treat every booking as blocking.
            ids = jdbc.queryForList(overlap, Long.class, Date.valueOf(out), Date.valueOf(in));
        }
        Set<String> set = new HashSet<>();
        for (Long id : ids) set.add(String.valueOf(id));
        return set;
    }

    private void attachFirstImages(List<Map<String, Object>> properties) {
        if (properties.isEmpty()) return;
        Map<String, Map<String, Object>> first = new HashMap<>();
        for (Map<String, Object> img : jdbc.queryForList(
                "SELECT * FROM property_images ORDER BY property_id, display_order")) {
            first.putIfAbsent(String.valueOf(img.get("property_id")), img);
        }
        for (Map<String, Object> p : properties) {
            p.put("image", first.get(String.valueOf(p.get("id"))));
        }
    }

    // "Houston, TX" -> ["houston", "tx"]; every piece must match somewhere in the location columns.
    private List<String> locationTokens(String location) {
        List<String> tokens = new ArrayList<>();
        if (location == null) return tokens;
        for (String part : location.split(",")) {
            String t = part.trim().toLowerCase();
            if (!t.isEmpty()) tokens.add(t);
        }
        return tokens;
    }

    private boolean matchesLocation(Map<String, Object> row, List<String> tokens) {
        StringBuilder hay = new StringBuilder();
        for (Map.Entry<String, Object> e : row.entrySet()) {
            if (e.getValue() != null && LOCATION_KEY.matcher(e.getKey()).matches()) {
                hay.append(' ').append(e.getValue().toString().toLowerCase());
            }
        }
        Object title = row.get("title");
        if (title != null) hay.append(' ').append(title.toString().toLowerCase());
        String haystack = hay.toString();
        for (String t : tokens) {
            if (!haystack.contains(t)) return false;
        }
        return true;
    }

    private Integer capacityOf(Map<String, Object> row) {
        for (Map.Entry<String, Object> e : row.entrySet()) {
            if (CAPACITY_KEY.matcher(e.getKey()).matches() && e.getValue() instanceof Number) {
                return ((Number) e.getValue()).intValue();
            }
        }
        return null;
    }

    private LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) return null;
        return LocalDate.parse(value.trim());
    }

    private String text(Object value) {
        if (value == null) return null;
        String s = value.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private String firstText(Map<String, Object> row, String... keys) {
        for (String k : keys) {
            String v = text(row.get(k));
            if (v != null) return v;
        }
        return null;
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