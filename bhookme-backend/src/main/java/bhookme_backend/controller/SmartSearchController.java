package bhookme_backend.controller;

import bhookme_backend.service.SmartSearchQuery;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.*;

// Smart search: understands "1 bedroom", "2br", "under 100", "sleeps 4",
// "pool", "toyota 2020" ... (see SmartSearchQuery for everything it reads).
//
//   GET /api/properties/search/smart?q=2 bedroom under 150&scope=homes&city=Houston&state=TX
//   GET /api/properties/search/smart?q=suv 2020&scope=cars
//
//   scope = homes | cars | all (default all)
//   city / state (optional) lock the search to one home-page section,
//   e.g. "Stay in Houston, TX" only ever returns Houston homes.
//
// Response:
//   { understood: ["2 bedrooms", "under $150"], words: [...],
//     homeIds: [..], carIds: [..],            <- every match, best first
//     homes: [..], cars: [..],                <- first 48 rows, with first photo
//     counts: { homes: n, cars: n } }
@RestController
@RequestMapping("/api/properties/search/smart")
public class SmartSearchController {

    private static final int ROW_LIMIT = 48;

    private final JdbcTemplate jdbc;

    public SmartSearchController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public ResponseEntity<?> search(@RequestParam(required = false) String q,
                                    @RequestParam(required = false, defaultValue = "all") String scope,
                                    @RequestParam(required = false) String city,
                                    @RequestParam(required = false) String state) {
        try {
            String s = scope == null ? "all" : scope.trim().toLowerCase(Locale.ROOT);
            boolean wantHomes = !s.equals("cars");
            boolean wantCars = !s.equals("homes");

            Map<String, Object> result = new LinkedHashMap<>();
            List<Map<String, Object>> homes = new ArrayList<>();
            List<Map<String, Object>> cars = new ArrayList<>();
            SmartSearchQuery homeQuery = SmartSearchQuery.parse(q, false);
            SmartSearchQuery carQuery = SmartSearchQuery.parse(q, true);

            if (wantHomes) homes = searchHomes(homeQuery, city, state);
            if (wantCars) cars = searchCars(carQuery, city, state);

            result.put("understood", wantHomes ? homeQuery.understood : carQuery.understood);
            result.put("words", wantHomes ? homeQuery.words : carQuery.words);
            result.put("homeIds", idsOf(homes));
            result.put("carIds", idsOf(cars));

            List<Map<String, Object>> homeRows = new ArrayList<>(homes.subList(0, Math.min(ROW_LIMIT, homes.size())));
            List<Map<String, Object>> carRows = new ArrayList<>(cars.subList(0, Math.min(ROW_LIMIT, cars.size())));
            attachFirstHomeImages(homeRows);
            attachFirstCarImages(carRows);
            result.put("homes", homeRows);
            result.put("cars", carRows);

            Map<String, Object> counts = new LinkedHashMap<>();
            counts.put("homes", homes.size());
            counts.put("cars", cars.size());
            result.put("counts", counts);
            return ResponseEntity.ok(result);
        } catch (RuntimeException e) {
            Map<String, String> body = new HashMap<>();
            body.put("message", "Search failed: " + rootMessage(e));
            return ResponseEntity.badRequest().body(body);
        }
    }

    // ---------- homes ----------

    private List<Map<String, Object>> searchHomes(SmartSearchQuery q, String city, String state) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT p.* FROM properties p WHERE p.status = 'ACTIVE' ORDER BY p.id DESC");
        Map<String, StringBuilder> amenities = amenityNames();

        List<Map<String, Object>> matched = new ArrayList<>();
        Map<Map<String, Object>, Integer> scores = new IdentityHashMap<>();

        for (Map<String, Object> row : rows) {
            if (!sameText(city, row.get("city")) || !sameText(state, row.get("state"))) continue;

            Integer bedrooms = intOf(row.get("bedrooms"));
            BigDecimal bathrooms = decimalOf(row.get("bathrooms"));
            Integer maxGuests = intOf(row.get("max_guests"));
            BigDecimal price = decimalOf(row.get("base_price_per_night"));
            String type = textOf(row.get("property_type"));

            String hay = join(row, "title", "description", "address_line1", "address_line2",
                              "city", "state", "zip_code", "country", "category")
                + " " + typeWords(type)
                + " " + (amenities.containsKey(idOf(row)) ? amenities.get(idOf(row)).toString() : "");

            if (q.bedroomsExact != null && (bedrooms == null || !bedrooms.equals(q.bedroomsExact))) continue;
            if (q.bedroomsMin != null && (bedrooms == null || bedrooms < q.bedroomsMin)) continue;
            if (q.studio && !(Integer.valueOf(0).equals(bedrooms) || hay.toLowerCase(Locale.ROOT).contains("studio"))) continue;
            if (q.bathroomsMin != null && (bathrooms == null || bathrooms.compareTo(q.bathroomsMin) < 0)) continue;
            if (q.guestsMin != null && (maxGuests == null || maxGuests < q.guestsMin)) continue;
            if (q.priceMax != null && (price == null || price.compareTo(q.priceMax) > 0)) continue;
            if (q.priceMin != null && (price == null || price.compareTo(q.priceMin) < 0)) continue;
            if (q.roomType != null && !q.roomType.equalsIgnoreCase(type == null ? "" : type)) continue;
            if (!q.wordsMatch(hay)) continue;

            scores.put(row, q.score(textOf(row.get("title"))) * 3 + q.score(hay));
            matched.add(row);
        }
        matched.sort((a, b) -> Integer.compare(scores.get(b), scores.get(a)));
        return matched;
    }

    // property_id -> " wifi pool parking ..." (empty if the tables aren't there)
    private Map<String, StringBuilder> amenityNames() {
        Map<String, StringBuilder> map = new HashMap<>();
        try {
            for (Map<String, Object> r : jdbc.queryForList(
                    "SELECT pa.property_id, a.name FROM property_amenities pa " +
                    "JOIN amenities a ON a.id = pa.amenity_id")) {
                map.computeIfAbsent(String.valueOf(r.get("property_id")), k -> new StringBuilder())
                   .append(' ').append(textOf(r.get("name")));
            }
        } catch (DataAccessException ignored) {
            // no amenities yet - text search still works on everything else
        }
        return map;
    }

    private String typeWords(String type) {
        if (type == null) return "";
        switch (type.toUpperCase(Locale.ROOT)) {
            case "ENTIRE_PLACE": return "entire place whole home";
            case "PRIVATE_ROOM": return "private room";
            case "SHARED_ROOM": return "shared room";
            default: return type.toLowerCase(Locale.ROOT).replace('_', ' ');
        }
    }

    // ---------- cars ----------

    private List<Map<String, Object>> searchCars(SmartSearchQuery q, String city, String state) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT c.* FROM car_rentals c WHERE c.status IS NULL OR c.status = 'ACTIVE' ORDER BY c.id DESC");

        List<Map<String, Object>> matched = new ArrayList<>();
        Map<Map<String, Object>, Integer> scores = new IdentityHashMap<>();

        for (Map<String, Object> row : rows) {
            if (!sameText(city, row.get("city")) || !sameText(state, row.get("state"))) continue;

            Integer year = intOf(row.get("year"));
            BigDecimal rate = decimalOf(row.get("daily_rate"));
            String hay = join(row, "make", "model", "year", "category", "city", "state");

            if (q.year != null && (year == null || !year.equals(q.year))) continue;
            if (q.priceMax != null && (rate == null || rate.compareTo(q.priceMax) > 0)) continue;
            if (q.priceMin != null && (rate == null || rate.compareTo(q.priceMin) < 0)) continue;
            if (!q.wordsMatch(hay)) continue;

            scores.put(row, q.score(join(row, "make", "model")) * 3 + q.score(hay));
            matched.add(row);
        }
        matched.sort((a, b) -> Integer.compare(scores.get(b), scores.get(a)));
        return matched;
    }

    // ---------- photos ----------

    private void attachFirstHomeImages(List<Map<String, Object>> homes) {
        if (homes.isEmpty()) return;
        Map<String, Map<String, Object>> first = new HashMap<>();
        for (Map<String, Object> img : jdbc.queryForList(
                "SELECT * FROM property_images ORDER BY property_id, display_order")) {
            first.putIfAbsent(String.valueOf(img.get("property_id")), img);
        }
        for (Map<String, Object> h : homes) {
            h.put("image", first.get(idOf(h)));
        }
    }

    private void attachFirstCarImages(List<Map<String, Object>> cars) {
        if (cars.isEmpty()) return;
        List<String> tables = jdbc.queryForList(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() " +
            "AND (table_name LIKE '%car%image%' OR table_name LIKE '%car%photo%') ORDER BY table_name",
            String.class);
        if (tables.isEmpty()) return;
        String table = tables.get(0);
        List<String> cols = new ArrayList<>();
        for (String c : jdbc.queryForList(
                "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?",
                String.class, table)) {
            cols.add(c.toLowerCase(Locale.ROOT));
        }
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
            Map<String, Object> img = first.get(idOf(car));
            if (img != null) car.put("image", img);
        }
    }

    // ---------- helpers ----------

    private List<Object> idsOf(List<Map<String, Object>> rows) {
        List<Object> ids = new ArrayList<>();
        for (Map<String, Object> r : rows) ids.add(r.get("id"));
        return ids;
    }

    private String idOf(Map<String, Object> row) {
        return String.valueOf(row.get("id"));
    }

    // Empty filter = any value; otherwise case-insensitive exact match.
    private boolean sameText(String wanted, Object actual) {
        if (wanted == null || wanted.isBlank()) return true;
        String a = textOf(actual);
        return a != null && a.trim().equalsIgnoreCase(wanted.trim());
    }

    private String join(Map<String, Object> row, String... keys) {
        StringBuilder sb = new StringBuilder();
        for (String k : keys) {
            Object v = row.get(k);
            if (v != null) sb.append(' ').append(v);
        }
        return sb.toString();
    }

    private String textOf(Object v) {
        if (v == null) return null;
        String s = v.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private Integer intOf(Object v) {
        if (v instanceof Number) return ((Number) v).intValue();
        try {
            return v == null ? null : (int) Double.parseDouble(v.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private BigDecimal decimalOf(Object v) {
        if (v instanceof BigDecimal) return (BigDecimal) v;
        if (v instanceof Number) return new BigDecimal(v.toString());
        try {
            return v == null ? null : new BigDecimal(v.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String rootMessage(RuntimeException e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        return root.getMessage() != null ? root.getMessage() : String.valueOf(e);
    }
}