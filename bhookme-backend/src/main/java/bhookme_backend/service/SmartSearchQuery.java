package bhookme_backend.service;

import java.math.BigDecimal;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns what a guest types into real search filters.
 *
 *   "2 bedroom house in houston under 150 with pool"
 *     -> bedrooms = 2, maxPrice = 150, words = [house, houston, pool]
 *
 * Understood (any combination, any order):
 *   bedrooms   1bedroom, 1 bedroom, 1-bedroom, 1br, 1bd, 1 bed, one bedroom,
 *              2+ bedrooms, 2 or more bedrooms, at least 2 bedrooms, studio
 *   bathrooms  2 bath, 2ba, 1.5 baths, 2+ baths
 *   guests     for 4, sleeps 6, fits 5, 4 guests, 4 people
 *   price      under/below/less than/max/up to/cheaper than 100, $100,
 *              over/above/more than/min/at least/from 90, between 80 and 150
 *   car year   2019, 2021 ... (cars only)
 *   room type  entire place / whole home, private room, shared room
 * Everything left over becomes words that must each match the listing's
 * text (title, description, address, type, amenities ...), allowing
 * plurals, a few synonyms (apt = apartment, wifi = internet ...) and
 * small typos ("housten" finds Houston).
 *
 * Plain Java on purpose - no Spring or database - so it's easy to test.
 */
public class SmartSearchQuery {

    public Integer bedroomsExact;
    public Integer bedroomsMin;
    public boolean studio;
    public BigDecimal bathroomsMin;
    public Integer guestsMin;
    public BigDecimal priceMax;
    public BigDecimal priceMin;
    public Integer year;
    public String roomType;            // ENTIRE_PLACE | PRIVATE_ROOM | SHARED_ROOM
    public final List<String> words = new ArrayList<>();
    public final List<String> understood = new ArrayList<>();

    private static final Map<String, String> NUMBER_WORDS = new LinkedHashMap<>();
    static {
        String[] n = {"zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"};
        for (int i = 0; i < n.length; i++) NUMBER_WORDS.put(n[i], String.valueOf(i));
    }

    // Filler words that carry no meaning for the search.
    private static final Set<String> STOP = new HashSet<>(Arrays.asList(
        "a", "an", "the", "in", "near", "around", "with", "and", "for", "to", "of", "at", "on", "by",
        "me", "my", "i", "want", "need", "looking", "find", "show", "please", "some", "any", "or",
        "stay", "stays", "place", "places", "rent", "rental", "rentals", "listing", "listings",
        "per", "night", "nights", "day", "days", "nightly", "daily", "price", "dollars", "dollar", "usd",
        "homes", "cars", "car", "vehicle", "vehicles", "available", "cheap", "cheapest", "nice", "good", "best"));

    // Groups of words that mean the same thing - any one of them matches.
    private static final List<List<String>> SYNONYMS = Arrays.asList(
        Arrays.asList("apartment", "apt", "flat"),
        Arrays.asList("house", "home"),
        Arrays.asList("condo", "condominium"),
        Arrays.asList("townhouse", "townhome"),
        Arrays.asList("cabin", "cottage", "lodge"),
        Arrays.asList("wifi", "wi-fi", "internet", "wireless"),
        Arrays.asList("parking", "garage", "driveway"),
        Arrays.asList("pool", "swimming"),
        Arrays.asList("pet", "pets", "dog", "dogs", "cat", "cats"),
        Arrays.asList("washer", "laundry", "dryer"),
        Arrays.asList("ac", "air", "conditioning", "aircon"),
        Arrays.asList("tv", "television"),
        Arrays.asList("gym", "fitness"),
        Arrays.asList("suv", "crossover"),
        Arrays.asList("truck", "pickup"),
        Arrays.asList("van", "minivan"),
        Arrays.asList("electric", "ev"),
        Arrays.asList("luxury", "premium"),
        Arrays.asList("chevy", "chevrolet"),
        Arrays.asList("vw", "volkswagen"),
        Arrays.asList("benz", "mercedes"));

    private static final String NUM = "(\\d+(?:\\.\\d+)?)";
    private static final String BED = "(?:bed(?:room)?s?|br|bd|bdr|bdrm|bdrms|brs)";
    private static final String BATH = "(?:bath(?:room)?s?|ba|bth)";

    private static final Pattern BED_MIN = Pattern.compile(
        "(?:at\\s*least\\s*)?" + NUM + "\\s*(?:\\+|or\\s*more|plus)\\s*" + BED + "\\b"
        + "|at\\s*least\\s*" + NUM + "\\s*" + BED + "\\b");
    private static final Pattern BED_EXACT = Pattern.compile(NUM + "\\s*" + BED + "\\b");
    private static final Pattern STUDIO = Pattern.compile("\\bstudios?\\b");
    private static final Pattern BATH_P = Pattern.compile(NUM + "\\s*(?:\\+|or\\s*more|plus)?\\s*" + BATH + "\\b");
    private static final Pattern GUESTS_A = Pattern.compile("\\b(?:for|sleeps|sleep|fits|fit)\\s*" + NUM + "\\b(?:\\s*(?:guests?|people|persons?|adults?))?");
    private static final Pattern GUESTS_B = Pattern.compile(NUM + "\\s*(?:guests?|people|persons?|adults?)\\b");
    private static final Pattern BETWEEN = Pattern.compile("\\bbetween\\s*\\$?" + NUM + "\\s*(?:and|-|to)\\s*\\$?" + NUM);
    private static final Pattern PRICE_MAX = Pattern.compile("(?:\\bunder|\\bbelow|\\bless\\s*than|\\bmax(?:imum)?|\\bup\\s*to|\\bcheaper\\s*than|\\bat\\s*most|<)\\s*\\$?" + NUM);
    private static final Pattern PRICE_MIN = Pattern.compile("(?:\\bover|\\babove|\\bmore\\s*than|\\bmin(?:imum)?|\\bat\\s*least|\\bfrom|>)\\s*\\$?" + NUM);
    private static final Pattern DOLLAR = Pattern.compile("\\$\\s*" + NUM + "|" + NUM + "\\s*(?:dollars?|usd)\\b");
    private static final Pattern YEAR = Pattern.compile("\\b(19[5-9]\\d|20[0-4]\\d)\\b");
    private static final Pattern ENTIRE = Pattern.compile("\\b(?:entire|whole)\\s*(?:place|home|house|apartment|unit)\\b");
    private static final Pattern PRIVATE_ROOM = Pattern.compile("\\bprivate\\s*rooms?\\b");
    private static final Pattern SHARED_ROOM = Pattern.compile("\\bshared\\s*rooms?\\b");

    public static SmartSearchQuery parse(String raw, boolean carScope) {
        SmartSearchQuery q = new SmartSearchQuery();
        if (raw == null) return q;
        String s = " " + raw.toLowerCase(Locale.ROOT).replace(',', ' ') + " ";
        s = s.replaceAll("(\\d)\\s*-\\s*(?=[a-z])", "$1 ");          // "1-bedroom" -> "1 bedroom"
        for (Map.Entry<String, String> e : NUMBER_WORDS.entrySet()) {  // "two bedroom" -> "2 bedroom"
            s = s.replaceAll("\\b" + e.getKey() + "\\b(?=\\s*(?:\\+|or\\s*more|plus)?\\s*(?:bed|bath|br\\b|bd\\b|ba\\b|guest|people|person|adult))",
                    e.getValue());
        }
        s = s.replaceAll("\\b(?:for|sleeps|fits)\\s+(one|two|three|four|five|six|seven|eight|nine|ten)\\b", "for $1");
        for (Map.Entry<String, String> e : NUMBER_WORDS.entrySet()) {
            s = s.replaceAll("\\bfor " + e.getKey() + "\\b", "for " + e.getValue());
        }

        Matcher m;
        if (!carScope) {
            m = BED_MIN.matcher(s);
            if (m.find()) {
                q.bedroomsMin = (int) Double.parseDouble(m.group(1) != null ? m.group(1) : m.group(2));
                q.understood.add(q.bedroomsMin + "+ bedrooms");
                s = m.replaceFirst(" ");
            } else {
                m = BED_EXACT.matcher(s);
                if (m.find()) {
                    q.bedroomsExact = (int) Double.parseDouble(m.group(1));
                    q.understood.add(q.bedroomsExact == 0 ? "studio" : q.bedroomsExact + (q.bedroomsExact == 1 ? " bedroom" : " bedrooms"));
                    s = m.replaceFirst(" ");
                }
            }
            m = STUDIO.matcher(s);
            if (m.find()) {
                q.studio = true;
                if (!q.understood.contains("studio")) q.understood.add("studio");
                s = m.replaceFirst(" ");
            }
            m = BATH_P.matcher(s);
            if (m.find()) {
                q.bathroomsMin = new BigDecimal(m.group(1));
                q.understood.add(q.bathroomsMin.stripTrailingZeros().toPlainString() + "+ baths");
                s = m.replaceFirst(" ");
            }
            m = GUESTS_A.matcher(s);
            if (!m.find()) m = GUESTS_B.matcher(s);
            else m.reset();
            if (m.find()) {
                q.guestsMin = (int) Double.parseDouble(m.group(1));
                q.understood.add("fits " + q.guestsMin + (q.guestsMin == 1 ? " guest" : " guests"));
                s = m.replaceFirst(" ");
            }
            m = PRIVATE_ROOM.matcher(s);
            if (m.find()) { q.roomType = "PRIVATE_ROOM"; q.understood.add("private room"); s = m.replaceFirst(" "); }
            m = SHARED_ROOM.matcher(s);
            if (q.roomType == null && m.find()) { q.roomType = "SHARED_ROOM"; q.understood.add("shared room"); s = m.replaceFirst(" "); }
            m = ENTIRE.matcher(s);
            if (q.roomType == null && m.find()) { q.roomType = "ENTIRE_PLACE"; q.understood.add("entire place"); s = m.replaceFirst(" "); }
        }

        m = BETWEEN.matcher(s);
        if (m.find()) {
            BigDecimal a = new BigDecimal(m.group(1)), b = new BigDecimal(m.group(2));
            q.priceMin = a.min(b);
            q.priceMax = a.max(b);
            q.understood.add("$" + plain(q.priceMin) + " - $" + plain(q.priceMax));
            s = m.replaceFirst(" ");
        }
        m = PRICE_MAX.matcher(s);
        if (q.priceMax == null && m.find()) {
            q.priceMax = new BigDecimal(m.group(1));
            q.understood.add("under $" + plain(q.priceMax));
            s = m.replaceFirst(" ");
        }
        m = PRICE_MIN.matcher(s);
        if (q.priceMin == null && m.find()) {
            q.priceMin = new BigDecimal(m.group(1));
            q.understood.add("over $" + plain(q.priceMin));
            s = m.replaceFirst(" ");
        }
        m = DOLLAR.matcher(s);
        if (q.priceMax == null && m.find()) {
            q.priceMax = new BigDecimal(m.group(1) != null ? m.group(1) : m.group(2));
            q.understood.add("under $" + plain(q.priceMax));
            s = m.replaceFirst(" ");
        }
        if (carScope) {
            m = YEAR.matcher(s);
            if (m.find()) {
                q.year = Integer.parseInt(m.group(1));
                q.understood.add(String.valueOf(q.year));
                s = m.replaceFirst(" ");
            }
        }

        for (String w : s.split("[^a-z0-9.\\-]+")) {
            w = w.replaceAll("^[.\\-]+|[.\\-]+$", "");
            if (w.isEmpty() || STOP.contains(w)) continue;
            q.words.add(w);
        }
        return q;
    }

    private static String plain(BigDecimal v) {
        return v.stripTrailingZeros().toPlainString();
    }

    public boolean isEmpty() {
        return bedroomsExact == null && bedroomsMin == null && !studio && bathroomsMin == null
            && guestsMin == null && priceMax == null && priceMin == null && year == null
            && roomType == null && words.isEmpty();
    }

    // ---------- text matching ----------

    /** True when every leftover word is found in the listing's text. */
    public boolean wordsMatch(String haystack) {
        if (words.isEmpty()) return true;
        String hay = haystack == null ? "" : haystack.toLowerCase(Locale.ROOT);
        String[] tokens = hay.split("[^a-z0-9]+");
        for (String w : words) {
            if (!wordMatches(w, hay, tokens)) return false;
        }
        return true;
    }

    /** How many words appear in the given text - used to rank results. */
    public int score(String text) {
        if (text == null || words.isEmpty()) return 0;
        String t = text.toLowerCase(Locale.ROOT);
        int n = 0;
        for (String w : words) if (t.contains(w)) n++;
        return n;
    }

    private static boolean wordMatches(String w, String hay, String[] tokens) {
        for (String v : variants(w)) {
            if (hay.contains(v)) return true;
        }
        if (w.length() >= 5) {
            int allowed = w.length() >= 8 ? 2 : 1;
            for (String t : tokens) {
                if (t.length() >= 4 && Math.abs(t.length() - w.length()) <= allowed
                        && distance(w, t, allowed) <= allowed) {
                    return true;
                }
            }
        }
        return false;
    }

    private static Set<String> variants(String w) {
        Set<String> out = new LinkedHashSet<>();
        out.add(w);
        if (w.length() > 3 && w.endsWith("es")) out.add(w.substring(0, w.length() - 2));
        if (w.length() > 3 && w.endsWith("s")) out.add(w.substring(0, w.length() - 1));
        for (List<String> group : SYNONYMS) {
            for (String base : new ArrayList<>(out)) {
                if (group.contains(base)) { out.addAll(group); break; }
            }
        }
        return out;
    }

    // Levenshtein distance, giving up early once it exceeds the limit.
    private static int distance(String a, String b, int limit) {
        int[] prev = new int[b.length() + 1];
        int[] cur = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) prev[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            cur[0] = i;
            int rowMin = cur[0];
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                cur[j] = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
                rowMin = Math.min(rowMin, cur[j]);
            }
            if (rowMin > limit) return limit + 1;
            int[] tmp = prev; prev = cur; cur = tmp;
        }
        return prev[b.length()];
    }
}