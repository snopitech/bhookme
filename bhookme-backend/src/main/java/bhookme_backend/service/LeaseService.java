package bhookme_backend.service;

import bhookme_backend.model.User;
import bhookme_backend.repository.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

// ============================================================
// Monthly stays & leases
// ------------------------------------------------------------
// Separate lease listings (homes/apartments rented by the month)
// and the rental applications tenants send for them.
//
// Flow:
//   1. Host creates a lease listing (monthly rent, deposit,
//      min/max months, photos).
//   2. Tenant picks a move-in date + number of months (1 month
//      minimum), sees the price, fills the application, submits.
//      -> application status PENDING.
//   3. Host approves or declines it in the host dashboard.
//   4. Once APPROVED, the tenant's dashboard shows the amount due
//      (first month + security deposit). Before that, no amount
//      is shown there.
//   5. Works like bookings: the host marks it paid, then Confirms.
//      Confirming releases the signed lease agreement (PDF) to the
//      tenant and files a copy in both Documents tabs (tenant + host).
//      Unconfirm / Unmark paid take it back. Decline works until confirmed.
//   6. Tenant and host can message each other about the application.
//
// The tenant signs the lease agreement inside the application
// (typed signature = their full name). Emails go out when an
// application arrives (host), and when it is approved / declined /
// marked paid (tenant, to the email on file).
//
// All tables are created here on startup with plain SQL (no JPA
// entities), so Hibernate's schema validation never complains and
// no manual SQL is ever needed - locally or on the server.
// ============================================================
@Service
public class LeaseService {

    private static final Logger log = LoggerFactory.getLogger(LeaseService.class);

    public static final int MAX_PHOTOS_PER_LEASE = 30;
    public static final int MAX_MONTHS_LIMIT = 36;

    private static final Set<String> PROPERTY_TYPES =
            Set.of("APARTMENT", "HOUSE", "CONDO", "TOWNHOUSE", "STUDIO", "ROOM");

    private static final DateTimeFormatter NICE_DATE = DateTimeFormatter.ofPattern("MMM d, yyyy");

    private final JdbcTemplate jdbc;
    private final UserRepository userRepository;
    private final R2StorageService r2StorageService;
    private final EmailService emailService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public LeaseService(JdbcTemplate jdbc, UserRepository userRepository, R2StorageService r2StorageService,
                        EmailService emailService) {
        this.jdbc = jdbc;
        this.userRepository = userRepository;
        this.r2StorageService = r2StorageService;
        this.emailService = emailService;
    }

    // ------------------------------------------------------------
    // Tables (created automatically, only if missing)
    // ------------------------------------------------------------
    @PostConstruct
    void createTables() {
        try {
            jdbc.execute("CREATE TABLE IF NOT EXISTS leases ("
                    + " id BIGINT AUTO_INCREMENT PRIMARY KEY,"
                    + " host_user_id BIGINT NOT NULL,"
                    + " title VARCHAR(200) NOT NULL,"
                    + " description TEXT,"
                    + " property_type VARCHAR(40) NOT NULL,"
                    + " address VARCHAR(255),"
                    + " city VARCHAR(100) NOT NULL,"
                    + " state VARCHAR(50) NOT NULL,"
                    + " zip VARCHAR(20),"
                    + " bedrooms INT NOT NULL DEFAULT 0,"
                    + " bathrooms DECIMAL(3,1) NOT NULL DEFAULT 1,"
                    + " monthly_rent DECIMAL(10,2) NOT NULL,"
                    + " security_deposit DECIMAL(10,2) NOT NULL DEFAULT 0,"
                    + " min_months INT NOT NULL DEFAULT 1,"
                    + " max_months INT NOT NULL DEFAULT 12,"
                    + " available_from DATE NULL,"
                    + " furnished TINYINT(1) NOT NULL DEFAULT 0,"
                    + " pets_allowed TINYINT(1) NOT NULL DEFAULT 0,"
                    + " utilities_included TINYINT(1) NOT NULL DEFAULT 0,"
                    + " image_url VARCHAR(500),"
                    + " status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',"
                    + " deleted TINYINT(1) NOT NULL DEFAULT 0,"
                    + " created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                    + " updated_at DATETIME NULL,"
                    + " INDEX idx_leases_host (host_user_id),"
                    + " INDEX idx_leases_status (status, deleted)"
                    + ")");

            jdbc.execute("CREATE TABLE IF NOT EXISTS lease_images ("
                    + " id BIGINT AUTO_INCREMENT PRIMARY KEY,"
                    + " lease_id BIGINT NOT NULL,"
                    + " image_url VARCHAR(500) NOT NULL,"
                    + " display_order INT NOT NULL DEFAULT 0,"
                    + " INDEX idx_lease_images_lease (lease_id)"
                    + ")");

            jdbc.execute("CREATE TABLE IF NOT EXISTS lease_applications ("
                    + " id BIGINT AUTO_INCREMENT PRIMARY KEY,"
                    + " lease_id BIGINT NOT NULL,"
                    + " tenant_user_id BIGINT NOT NULL,"
                    + " host_user_id BIGINT NOT NULL,"
                    + " move_in_date DATE NOT NULL,"
                    + " months INT NOT NULL,"
                    + " monthly_rent DECIMAL(10,2) NOT NULL,"
                    + " security_deposit DECIMAL(10,2) NOT NULL,"
                    + " lease_total DECIMAL(12,2) NOT NULL,"
                    + " amount_due DECIMAL(12,2) NOT NULL,"
                    + " full_name VARCHAR(150) NOT NULL,"
                    + " phone VARCHAR(40) NOT NULL,"
                    + " date_of_birth DATE NULL,"
                    + " current_address VARCHAR(255) NOT NULL,"
                    + " employer VARCHAR(150),"
                    + " monthly_income DECIMAL(12,2) NULL,"
                    + " occupants INT NOT NULL DEFAULT 1,"
                    + " has_pets TINYINT(1) NOT NULL DEFAULT 0,"
                    + " pet_details VARCHAR(255),"
                    + " message TEXT,"
                    + " status VARCHAR(20) NOT NULL DEFAULT 'PENDING',"
                    + " host_note VARCHAR(500),"
                    + " paid TINYINT(1) NOT NULL DEFAULT 0,"
                    + " created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                    + " decided_at DATETIME NULL,"
                    + " paid_at DATETIME NULL,"
                    + " INDEX idx_lease_apps_lease (lease_id),"
                    + " INDEX idx_lease_apps_tenant (tenant_user_id),"
                    + " INDEX idx_lease_apps_host (host_user_id)"
                    + ")");
        } catch (Exception e) {
            log.warn("Could not create lease tables: {}", e.getMessage());
        }

        // Added for the full rental application + signed lease agreement.
        addColumnIfMissing("lease_applications", "applicant_email", "VARCHAR(255) NULL");
        addColumnIfMissing("lease_applications", "details", "TEXT NULL");
        addColumnIfMissing("lease_applications", "signature_name", "VARCHAR(150) NULL");
        addColumnIfMissing("lease_applications", "signed_at", "DATETIME NULL");

        // Added for Confirm / Unconfirm (like bookings). Confirmed = the lease
        // document is released to the tenant and kept in both Documents tabs.
        addColumnIfMissing("lease_applications", "confirmed", "TINYINT(1) NOT NULL DEFAULT 0");
        addColumnIfMissing("lease_applications", "confirmed_at", "DATETIME NULL");

        // Messages between the tenant and the host about one application.
        try {
            jdbc.execute("CREATE TABLE IF NOT EXISTS lease_messages ("
                    + " id BIGINT AUTO_INCREMENT PRIMARY KEY,"
                    + " application_id BIGINT NOT NULL,"
                    + " sender_user_id BIGINT NOT NULL,"
                    + " content TEXT NOT NULL,"
                    + " created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                    + " read_at DATETIME NULL,"
                    + " INDEX idx_lease_msgs_app (application_id)"
                    + ")");
        } catch (Exception e) {
            log.warn("Could not create lease_messages table: {}", e.getMessage());
        }
    }

    private void addColumnIfMissing(String table, String column, String definition) {
        try {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"
                            + " AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, table, column);
            if (exists == null || exists == 0) {
                jdbc.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
                log.info("Added column {}.{}", table, column);
            }
        } catch (Exception e) {
            log.warn("Could not add column {}.{}: {}", table, column, e.getMessage());
        }
    }

    // ============================================================
    // LEASE LISTINGS
    // ============================================================

    // Public: every active lease listing, newest first.
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getActiveLeases() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM leases WHERE status = 'ACTIVE' AND deleted = 0 ORDER BY id DESC");
        return toLeaseResponses(rows, false);
    }

    // Public: one lease listing. The street address and zip stay
    // hidden here - the tenant sees them after the host approves.
    @Transactional(readOnly = true)
    public Map<String, Object> getLease(Long id) {
        Map<String, Object> row = findLeaseRow(id);
        if (row == null || isTrue(row.get("deleted"))) throw new RuntimeException("Lease listing not found");
        return toLeaseResponses(List.of(row), false).get(0);
    }

    // The logged-in host's own lease listings (with full address).
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getMyLeases(String hostEmail) {
        User host = findUser(hostEmail);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM leases WHERE host_user_id = ? AND deleted = 0 ORDER BY id DESC", host.getId());
        List<Map<String, Object>> out = toLeaseResponses(rows, true);

        // Pending application count per listing, for the host table.
        Map<Long, Integer> pending = new HashMap<>();
        for (Map<String, Object> r : jdbc.queryForList(
                "SELECT lease_id, COUNT(*) AS c FROM lease_applications WHERE host_user_id = ? AND status = 'PENDING' GROUP BY lease_id",
                host.getId())) {
            pending.put(toLong(r.get("lease_id")), toInt(r.get("c")));
        }
        for (Map<String, Object> l : out) {
            l.put("pendingApplications", pending.getOrDefault((Long) l.get("id"), 0));
        }
        return out;
    }

    // There is NO limit on how many lease listings one host can create.
    @Transactional
    public Map<String, Object> createLease(String hostEmail, Map<String, Object> body) {
        User host = findUser(hostEmail);
        LeaseFields f = readLeaseFields(body);

        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO leases (host_user_id, title, description, property_type, address, city, state, zip,"
                            + " bedrooms, bathrooms, monthly_rent, security_deposit, min_months, max_months, available_from,"
                            + " furnished, pets_allowed, utilities_included, image_url, status)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, host.getId());
            fillLeaseStatement(ps, 2, f);
            return ps;
        }, keys);
        Long id = keys.getKey().longValue();
        savePhotos(id, f.photos);

        if (!Boolean.TRUE.equals(host.getIsHost())) {
            host.setIsHost(true);
            userRepository.save(host);
        }
        return toLeaseResponses(List.of(findLeaseRow(id)), true).get(0);
    }

    @Transactional
    public Map<String, Object> updateLease(String hostEmail, Long id, Map<String, Object> body) {
        findOwnLease(hostEmail, id);
        LeaseFields f = readLeaseFields(body);

        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "UPDATE leases SET title = ?, description = ?, property_type = ?, address = ?, city = ?, state = ?, zip = ?,"
                            + " bedrooms = ?, bathrooms = ?, monthly_rent = ?, security_deposit = ?, min_months = ?, max_months = ?,"
                            + " available_from = ?, furnished = ?, pets_allowed = ?, utilities_included = ?, image_url = ?,"
                            + " updated_at = NOW() WHERE id = ?");
            int next = fillLeaseStatement(ps, 1, f);
            ps.setLong(next, id);
            return ps;
        });
        jdbc.update("DELETE FROM lease_images WHERE lease_id = ?", id);
        savePhotos(id, f.photos);
        return toLeaseResponses(List.of(findLeaseRow(id)), true).get(0);
    }

    // Pause (INACTIVE) or reactivate (ACTIVE).
    @Transactional
    public Map<String, Object> setLeaseStatus(String hostEmail, Long id, String status) {
        findOwnLease(hostEmail, id);
        String s = String.valueOf(status).trim().toUpperCase();
        if (!s.equals("ACTIVE") && !s.equals("INACTIVE")) {
            throw new RuntimeException("Status must be ACTIVE or INACTIVE.");
        }
        jdbc.update("UPDATE leases SET status = ?, updated_at = NOW() WHERE id = ?", s, id);
        return toLeaseResponses(List.of(findLeaseRow(id)), true).get(0);
    }

    // Delete a lease listing.
    //  - Pending applications, or approved ones whose move-in is
    //    today or later -> refused (decline/finish them first, or Pause).
    //  - No applications ever -> removed completely.
    //  - Has application history -> hidden for good (deleted = 1).
    @Transactional
    public Map<String, Object> deleteLease(String hostEmail, Long id) {
        findOwnLease(hostEmail, id);

        Integer open = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lease_applications WHERE lease_id = ? AND (status = 'PENDING'"
                        + " OR (status = 'APPROVED' AND move_in_date >= CURDATE()))",
                Integer.class, id);
        if (open != null && open > 0) {
            throw new RuntimeException("This listing has " + open + " open application" + (open == 1 ? "" : "s")
                    + ". Decline or finish " + (open == 1 ? "it" : "them") + " first, or Pause the listing instead.");
        }

        Integer any = jdbc.queryForObject("SELECT COUNT(*) FROM lease_applications WHERE lease_id = ?", Integer.class, id);
        if (any == null || any == 0) {
            jdbc.update("DELETE FROM lease_images WHERE lease_id = ?", id);
            jdbc.update("DELETE FROM leases WHERE id = ?", id);
        } else {
            jdbc.update("UPDATE leases SET deleted = 1, status = 'INACTIVE', updated_at = NOW() WHERE id = ?", id);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("deleted", true);
        out.put("message", "Lease listing deleted.");
        return out;
    }

    // ============================================================
    // APPLICATIONS
    // ============================================================

    // Tenant submits an application for a lease listing.
    @Transactional
    public Map<String, Object> apply(String tenantEmail, Long leaseId, Map<String, Object> body) {
        User tenant = findUser(tenantEmail);
        Map<String, Object> lease = findLeaseRow(leaseId);
        if (lease == null || isTrue(lease.get("deleted"))) throw new RuntimeException("Lease listing not found");
        if (!"ACTIVE".equals(lease.get("status"))) {
            throw new RuntimeException("This listing isn't accepting applications right now.");
        }
        Long hostId = toLong(lease.get("host_user_id"));
        if (hostId.equals(tenant.getId())) throw new RuntimeException("You can't apply to your own listing.");

        Integer existing = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lease_applications WHERE lease_id = ? AND tenant_user_id = ? AND status = 'PENDING'",
                Integer.class, leaseId, tenant.getId());
        if (existing != null && existing > 0) {
            throw new RuntimeException("You already have a pending application for this listing. "
                    + "You can see it in your dashboard under Leases.");
        }

        LocalDate moveIn = dateOrNull(body.get("moveInDate"));
        if (moveIn == null) throw new RuntimeException("Pick a move-in date.");
        if (moveIn.isBefore(LocalDate.now())) throw new RuntimeException("The move-in date can't be in the past.");
        LocalDate availableFrom = toLocalDate(lease.get("available_from"));
        if (availableFrom != null && moveIn.isBefore(availableFrom)) {
            throw new RuntimeException("This place is available from " + availableFrom + ". Pick that date or later.");
        }

        int minMonths = toInt(lease.get("min_months"));
        int maxMonths = toInt(lease.get("max_months"));
        Integer months = intOrNull(body.get("months"));
        if (months == null || months < minMonths || months > maxMonths) {
            throw new RuntimeException("Lease length must be between " + minMonths + " and " + maxMonths + " months.");
        }

        // Name and email always come from the signed-in account (shown greyed out on the form).
        String accountName = (nz(tenant.getFirstName()) + " " + nz(tenant.getLastName())).trim();
        String fullName = accountName.isEmpty() ? text(body.get("fullName")) : accountName;
        String applicantEmail = tenant.getEmail();
        String phone = text(body.get("phone"));
        String currentAddress = text(body.get("currentAddress"));
        Integer occupants = intOrNull(body.get("occupants"));
        if (fullName == null) throw new RuntimeException("Add your first and last name to your profile first.");
        if (phone == null) throw new RuntimeException("Enter your phone number.");
        if (currentAddress == null) throw new RuntimeException("Enter your current address.");
        if (occupants == null || occupants < 1 || occupants > 20) {
            throw new RuntimeException("Enter how many people will live there (1 or more).");
        }
        LocalDate dob = dateOrNull(body.get("dateOfBirth"));
        if (dob == null) throw new RuntimeException("Enter your date of birth.");
        if (dob.isAfter(LocalDate.now().minusYears(18))) {
            throw new RuntimeException("Applicants must be at least 18 years old.");
        }

        // Signature: the applicant types their full name to sign the lease agreement.
        String signatureName = text(body.get("signatureName"));
        if (!isTrue(body.get("agreeToLease"))) {
            throw new RuntimeException("Please read and accept the lease agreement.");
        }
        if (signatureName == null || !normalize(signatureName).equals(normalize(fullName))) {
            throw new RuntimeException("Type your full name exactly as shown (" + fullName + ") to sign.");
        }

        // Everything else on the application (residence history, employment,
        // emergency contact, references, background questions...) is stored as JSON.
        String detailsJson;
        try {
            Object details = body.get("details");
            detailsJson = details == null ? null : objectMapper.writeValueAsString(details);
        } catch (Exception e) {
            throw new RuntimeException("Some application answers could not be read. Please try again.");
        }
        if (detailsJson != null && detailsJson.length() > 20000) {
            throw new RuntimeException("The application is too long. Please shorten your answers.");
        }
        boolean hasPets = isTrue(body.get("hasPets"));
        if (hasPets && !isTrue(lease.get("pets_allowed"))) {
            throw new RuntimeException("This listing doesn't allow pets.");
        }

        BigDecimal rent = toDecimal(lease.get("monthly_rent"));
        BigDecimal deposit = toDecimal(lease.get("security_deposit"));
        BigDecimal leaseTotal = rent.multiply(BigDecimal.valueOf(months)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal amountDue = rent.add(deposit).setScale(2, RoundingMode.HALF_UP);

        String employer = text(body.get("employer"));
        BigDecimal income = decimalOrNull(body.get("monthlyIncome"));
        String petDetails = hasPets ? text(body.get("petDetails")) : null;
        String message = text(body.get("message"));

        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO lease_applications (lease_id, tenant_user_id, host_user_id, move_in_date, months,"
                            + " monthly_rent, security_deposit, lease_total, amount_due, full_name, phone, date_of_birth,"
                            + " current_address, employer, monthly_income, occupants, has_pets, pet_details, message, status,"
                            + " applicant_email, details, signature_name, signed_at)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, NOW())",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, leaseId);
            ps.setLong(2, tenant.getId());
            ps.setLong(3, hostId);
            ps.setDate(4, Date.valueOf(moveIn));
            ps.setInt(5, months);
            ps.setBigDecimal(6, rent);
            ps.setBigDecimal(7, deposit);
            ps.setBigDecimal(8, leaseTotal);
            ps.setBigDecimal(9, amountDue);
            ps.setString(10, cut(fullName, 150));
            ps.setString(11, cut(phone, 40));
            ps.setDate(12, dob == null ? null : Date.valueOf(dob));
            ps.setString(13, cut(currentAddress, 255));
            ps.setString(14, cut(employer, 150));
            ps.setBigDecimal(15, income);
            ps.setInt(16, occupants);
            ps.setBoolean(17, hasPets);
            ps.setString(18, cut(petDetails, 255));
            ps.setString(19, message);
            ps.setString(20, applicantEmail);
            ps.setString(21, detailsJson);
            ps.setString(22, cut(signatureName, 150));
            return ps;
        }, keys);

        // Let the host know a new application arrived.
        User host = userRepository.findById(hostId).orElse(null);
        if (host != null) {
            sendEmail(host.getEmail(), "New lease application: " + lease.get("title"),
                    "Hi " + nz(host.getFirstName()) + ",\n\n"
                            + fullName + " applied to lease \"" + lease.get("title") + "\" ("
                            + months + " month" + (months == 1 ? "" : "s") + ", moving in " + moveIn.format(NICE_DATE) + ").\n\n"
                            + "Review it in your host dashboard under Monthly Leases > Applications.\n\n"
                            + "- The bhookme team");
        }

        return toTenantView(findApplicationRow(keys.getKey().longValue()));
    }

    // Tenant: their own applications, newest first.
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getMyApplications(String tenantEmail) {
        User tenant = findUser(tenantEmail);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT * FROM lease_applications WHERE tenant_user_id = ? ORDER BY id DESC", tenant.getId())) {
            out.add(toTenantView(row));
        }
        return out;
    }

    // Host: every application for the host's listings, newest first.
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getHostApplications(String hostEmail) {
        User host = findUser(hostEmail);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT * FROM lease_applications WHERE host_user_id = ? ORDER BY id DESC", host.getId())) {
            out.add(toHostView(row));
        }
        return out;
    }

    // Host: approve or decline. {"decision": "APPROVED"|"DECLINED", "note": "..."}
    //  - Approve: only a pending application.
    //  - Decline: a pending one, or an approved one that isn't confirmed yet
    //    (Unconfirm first if it is).
    @Transactional
    public Map<String, Object> decide(String hostEmail, Long applicationId, String decision, String note) {
        Map<String, Object> app = findHostApplication(hostEmail, applicationId);
        String d = String.valueOf(decision).trim().toUpperCase();
        if (!d.equals("APPROVED") && !d.equals("DECLINED")) {
            throw new RuntimeException("Decision must be APPROVED or DECLINED.");
        }
        String current = String.valueOf(app.get("status"));
        boolean wasPaid = isTrue(app.get("paid"));
        if (d.equals("APPROVED") && !current.equals("PENDING")) {
            throw new RuntimeException("Only pending applications can be approved.");
        }
        if (d.equals("DECLINED")) {
            if (!current.equals("PENDING") && !current.equals("APPROVED")) {
                throw new RuntimeException("This application can't be declined anymore.");
            }
            if (isTrue(app.get("confirmed"))) {
                throw new RuntimeException("This lease is confirmed. Unconfirm it first, then decline.");
            }
        }
        jdbc.update("UPDATE lease_applications SET status = ?, host_note = ?, decided_at = NOW() WHERE id = ?",
                d, cut(text(note), 500), applicationId);

        Map<String, Object> updated = findApplicationRow(applicationId);
        Map<String, Object> lease = findLeaseRow(toLong(updated.get("lease_id")));
        String title = lease == null ? "your lease" : String.valueOf(lease.get("title"));
        String to = tenantEmailOf(updated);
        String first = firstNameOf(updated);
        String hostNote = text(note);

        if (d.equals("APPROVED")) {
            String address = lease == null ? "" : joinNonEmpty(", ", text(lease.get("address")),
                    text(lease.get("city")), text(lease.get("state")), text(lease.get("zip")));
            sendEmail(to, "Your lease application was approved - " + title,
                    "Hi " + first + ",\n\n"
                            + "Great news! Your application for \"" + title + "\" has been approved.\n\n"
                            + (address.isEmpty() ? "" : "Address: " + address + "\n")
                            + "Move-in: " + toLocalDate(updated.get("move_in_date")).format(NICE_DATE)
                            + " (" + toInt(updated.get("months")) + " month lease)\n\n"
                            + "Amount due now:\n"
                            + "  First month's rent: $" + money(toDecimal(updated.get("monthly_rent"))) + "\n"
                            + "  Security deposit:   $" + money(toDecimal(updated.get("security_deposit"))) + "\n"
                            + "  Total:              $" + money(toDecimal(updated.get("amount_due"))) + "\n\n"
                            + (hostNote == null ? "" : "Note from your host: " + hostNote + "\n\n")
                            + "Log in to bhookme and open your Dashboard > Leases to see your balance. "
                            + "Once your payment is received and the host confirms your lease, your signed lease agreement (PDF) "
                            + "will be in your Dashboard > Documents.\n\n"
                            + "- The bhookme team");
        } else {
            sendEmail(to, "Update on your lease application - " + title,
                    "Hi " + first + ",\n\n"
                            + "Thank you for applying to \"" + title + "\". Unfortunately the host was not able to approve your application this time.\n\n"
                            + (hostNote == null ? "" : "Note from the host: " + hostNote + "\n\n")
                            + (wasPaid ? "Your payment was marked as received. Please contact your host about your refund.\n\n" : "")
                            + "You can browse other monthly stays on bhookme anytime.\n\n"
                            + "- The bhookme team");
        }
        return toHostView(updated);
    }

    // Host: mark an approved application paid / unpaid. {"paid": true|false}
    @Transactional
    public Map<String, Object> setPaid(String hostEmail, Long applicationId, boolean paid) {
        Map<String, Object> app = findHostApplication(hostEmail, applicationId);
        if (!"APPROVED".equals(app.get("status"))) {
            throw new RuntimeException("Only approved applications can be marked paid.");
        }
        boolean wasPaid = isTrue(app.get("paid"));
        // Unmarking paid also unconfirms the lease (its document is pulled back).
        if (paid) {
            jdbc.update("UPDATE lease_applications SET paid = 1, paid_at = NOW() WHERE id = ?", applicationId);
        } else {
            jdbc.update("UPDATE lease_applications SET paid = 0, paid_at = NULL, confirmed = 0, confirmed_at = NULL WHERE id = ?",
                    applicationId);
        }
        Map<String, Object> updated = findApplicationRow(applicationId);

        if (paid && !wasPaid) {
            sendEmail(tenantEmailOf(updated), "Payment received - " + leaseTitleOf(updated),
                    "Hi " + firstNameOf(updated) + ",\n\n"
                            + "We received your payment of $" + money(toDecimal(updated.get("amount_due")))
                            + " (first month + security deposit) for \"" + leaseTitleOf(updated) + "\".\n\n"
                            + "Your host will confirm your lease shortly. Once confirmed, your signed lease agreement (PDF) "
                            + "will be in your Dashboard > Documents.\n\n"
                            + "- The bhookme team");
        }
        return toHostView(updated);
    }

    // Host: confirm / unconfirm an approved, paid lease. {"confirmed": true|false}
    // Confirming releases the signed lease agreement (PDF) to the tenant and
    // files a copy in both Documents tabs. Unconfirming takes it back.
    @Transactional
    public Map<String, Object> setConfirmed(String hostEmail, Long applicationId, boolean confirmed) {
        Map<String, Object> app = findHostApplication(hostEmail, applicationId);
        if (!"APPROVED".equals(app.get("status"))) {
            throw new RuntimeException("Only approved applications can be confirmed.");
        }
        if (confirmed && !isTrue(app.get("paid"))) {
            throw new RuntimeException("Mark the first payment as paid before confirming the lease.");
        }
        boolean wasConfirmed = isTrue(app.get("confirmed"));
        jdbc.update("UPDATE lease_applications SET confirmed = ?, confirmed_at = " + (confirmed ? "NOW()" : "NULL")
                + " WHERE id = ?", confirmed, applicationId);
        Map<String, Object> updated = findApplicationRow(applicationId);

        if (confirmed && !wasConfirmed) {
            sendEmail(tenantEmailOf(updated), "Your lease is confirmed - " + leaseTitleOf(updated),
                    "Hi " + firstNameOf(updated) + ",\n\n"
                            + "Your lease for \"" + leaseTitleOf(updated) + "\" is confirmed.\n"
                            + "Move-in: " + toLocalDate(updated.get("move_in_date")).format(NICE_DATE)
                            + " (" + toInt(updated.get("months")) + " month lease)\n\n"
                            + "Your signed lease agreement is ready. Download the PDF here:\n"
                            + "https://bhookme.com/tenant-dashboard?tab=documents\n\n"
                            + "Welcome home!\n- The bhookme team");
        } else if (!confirmed && wasConfirmed) {
            sendEmail(tenantEmailOf(updated), "Update on your lease - " + leaseTitleOf(updated),
                    "Hi " + firstNameOf(updated) + ",\n\n"
                            + "Your host has put the confirmation of your lease for \"" + leaseTitleOf(updated)
                            + "\" back on hold. The lease document will be available again once it's re-confirmed.\n\n"
                            + "You can message your host from your Dashboard > Leases.\n\n"
                            + "- The bhookme team");
        }
        return toHostView(updated);
    }

    // ============================================================
    // DOCUMENTS
    // ============================================================

    // Every confirmed lease agreement this user is part of:
    //   asTenant - leases they signed as the tenant
    //   asHost   - copies of leases for their listings
    @Transactional(readOnly = true)
    public Map<String, Object> getDocuments(String email) {
        User me = findUser(email);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("asTenant", documentsFor(jdbc.queryForList(
                "SELECT * FROM lease_applications WHERE tenant_user_id = ? AND status = 'APPROVED' AND confirmed = 1"
                        + " ORDER BY confirmed_at DESC, id DESC", me.getId()), true));
        out.put("asHost", documentsFor(jdbc.queryForList(
                "SELECT * FROM lease_applications WHERE host_user_id = ? AND status = 'APPROVED' AND confirmed = 1"
                        + " ORDER BY confirmed_at DESC, id DESC", me.getId()), false));
        return out;
    }

    private List<Map<String, Object>> documentsFor(List<Map<String, Object>> rows, boolean tenantSide) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> a : rows) {
            Map<String, Object> lease = findLeaseRow(toLong(a.get("lease_id")));
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("applicationId", toLong(a.get("id")));
            doc.put("leaseId", toLong(a.get("lease_id")));
            doc.put("title", "Lease agreement - " + (lease == null ? "Deleted listing" : lease.get("title")));
            doc.put("leaseTitle", lease == null ? "Deleted listing" : lease.get("title"));
            doc.put("leaseImageUrl", lease == null ? null : lease.get("image_url"));
            doc.put("leaseCity", lease == null ? null : lease.get("city"));
            doc.put("leaseState", lease == null ? null : lease.get("state"));
            doc.put("tenantName", a.get("full_name"));
            doc.put("hostName", hostNameOf(a));
            doc.put("otherPartyName", tenantSide ? hostNameOf(a) : a.get("full_name"));
            doc.put("moveInDate", toLocalDate(a.get("move_in_date")).toString());
            doc.put("moveOutDate", toLocalDate(a.get("move_in_date")).plusMonths(toInt(a.get("months"))).toString());
            doc.put("months", toInt(a.get("months")));
            doc.put("confirmedAt", a.get("confirmed_at") == null ? null : String.valueOf(a.get("confirmed_at")));
            doc.put("agreement", agreementOf(a));
            out.add(doc);
        }
        return out;
    }

    // ============================================================
    // MESSAGES (tenant <-> host, per application)
    // ============================================================

    // The conversation for one application. Opening it marks the other
    // person's messages as read.
    @Transactional
    public List<Map<String, Object>> getMessages(String email, Long applicationId) {
        User me = findUser(email);
        Map<String, Object> app = findParticipantApplication(me, applicationId);
        jdbc.update("UPDATE lease_messages SET read_at = NOW() WHERE application_id = ? AND sender_user_id <> ? AND read_at IS NULL",
                applicationId, me.getId());

        Map<Long, String> names = new HashMap<>();
        names.put(toLong(app.get("tenant_user_id")), firstNameOf(app));
        String hostName = hostNameOf(app);
        names.put(toLong(app.get("host_user_id")), hostName.isEmpty() ? "Host" : hostName.split("\\s+")[0]);

        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList(
                "SELECT * FROM lease_messages WHERE application_id = ? ORDER BY id", applicationId)) {
            out.add(toMessage(r, me.getId(), names));
        }
        return out;
    }

    // Send a message. {"content": "..."} The other person gets an email,
    // but only for the first unread message, so a chat doesn't flood their inbox.
    @Transactional
    public Map<String, Object> sendMessage(String email, Long applicationId, String content) {
        User me = findUser(email);
        Map<String, Object> app = findParticipantApplication(me, applicationId);
        String text = text(content);
        if (text == null) throw new RuntimeException("Type a message first.");
        if (text.length() > 2000) throw new RuntimeException("Messages can be up to 2000 characters.");
        if ("CANCELLED".equals(app.get("status"))) {
            throw new RuntimeException("This application was withdrawn, so messaging is closed.");
        }

        Integer unreadBefore = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lease_messages WHERE application_id = ? AND sender_user_id = ? AND read_at IS NULL",
                Integer.class, applicationId, me.getId());

        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO lease_messages (application_id, sender_user_id, content) VALUES (?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, applicationId);
            ps.setLong(2, me.getId());
            ps.setString(3, text);
            return ps;
        }, keys);

        boolean iAmHost = toLong(app.get("host_user_id")).equals(me.getId());
        if (unreadBefore == null || unreadBefore == 0) {
            String myName = (nz(me.getFirstName()) + " " + nz(me.getLastName())).trim();
            if (iAmHost) {
                sendEmail(tenantEmailOf(app), "New message from your host - " + leaseTitleOf(app),
                        "Hi " + firstNameOf(app) + ",\n\n"
                                + (myName.isEmpty() ? "Your host" : myName) + " sent you a message about \"" + leaseTitleOf(app) + "\":\n\n"
                                + "\"" + preview(text) + "\"\n\n"
                                + "Reply from your Dashboard > Leases:\nhttps://bhookme.com/tenant-dashboard?tab=leases\n\n"
                                + "- The bhookme team");
            } else {
                User host = userRepository.findById(toLong(app.get("host_user_id"))).orElse(null);
                if (host != null) {
                    sendEmail(host.getEmail(), "New message from " + nz(String.valueOf(app.get("full_name"))) + " - " + leaseTitleOf(app),
                            "Hi " + nz(host.getFirstName()) + ",\n\n"
                                    + app.get("full_name") + " sent you a message about their lease application for \""
                                    + leaseTitleOf(app) + "\":\n\n"
                                    + "\"" + preview(text) + "\"\n\n"
                                    + "Reply from your host dashboard under Monthly Leases > Applications.\n\n"
                                    + "- The bhookme team");
                }
            }
        }

        Map<Long, String> names = new HashMap<>();
        names.put(me.getId(), nz(me.getFirstName()));
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM lease_messages WHERE id = ?", keys.getKey().longValue());
        return toMessage(rows.get(0), me.getId(), names);
    }

    private Map<String, Object> toMessage(Map<String, Object> r, Long myId, Map<Long, String> names) {
        Long senderId = toLong(r.get("sender_user_id"));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", toLong(r.get("id")));
        m.put("senderId", senderId);
        m.put("mine", senderId.equals(myId));
        m.put("senderName", names.getOrDefault(senderId, ""));
        m.put("content", r.get("content"));
        m.put("createdAt", String.valueOf(r.get("created_at")));
        m.put("read", r.get("read_at") != null);
        return m;
    }

    private int unreadMessagesFor(Long applicationId, Long viewerId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lease_messages WHERE application_id = ? AND sender_user_id <> ? AND read_at IS NULL",
                Integer.class, applicationId, viewerId);
        return n == null ? 0 : n;
    }

    private int messageCountFor(Long applicationId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM lease_messages WHERE application_id = ?", Integer.class, applicationId);
        return n == null ? 0 : n;
    }

    private Map<String, Object> findParticipantApplication(User me, Long applicationId) {
        Map<String, Object> app = findApplicationRow(applicationId);
        if (app == null) throw new RuntimeException("Application not found");
        boolean isTenant = toLong(app.get("tenant_user_id")).equals(me.getId());
        boolean isHost = toLong(app.get("host_user_id")).equals(me.getId());
        if (!isTenant && !isHost) throw new RuntimeException("Application not found");
        return app;
    }

    private static String preview(String s) {
        return s.length() > 300 ? s.substring(0, 300) + "..." : s;
    }

    // Tenant: withdraw an application (pending, or approved but not paid yet).
    @Transactional
    public Map<String, Object> cancel(String tenantEmail, Long applicationId) {
        User tenant = findUser(tenantEmail);
        Map<String, Object> app = findApplicationRow(applicationId);
        if (app == null || !toLong(app.get("tenant_user_id")).equals(tenant.getId())) {
            throw new RuntimeException("Application not found");
        }
        String status = (String) app.get("status");
        boolean cancellable = "PENDING".equals(status) || ("APPROVED".equals(status) && !isTrue(app.get("paid")));
        if (!cancellable) throw new RuntimeException("This application can't be withdrawn anymore.");
        jdbc.update("UPDATE lease_applications SET status = 'CANCELLED', decided_at = NOW() WHERE id = ?", applicationId);
        return toTenantView(findApplicationRow(applicationId));
    }

    // ============================================================
    // Responses
    // ============================================================

    private List<Map<String, Object>> toLeaseResponses(List<Map<String, Object>> rows, boolean includeAddress) {
        Map<Long, User> hosts = new HashMap<>();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Long id = toLong(r.get("id"));
            Long hostId = toLong(r.get("host_user_id"));
            User host = hosts.computeIfAbsent(hostId, k -> userRepository.findById(k).orElse(null));

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("hostId", hostId);
            m.put("hostFirstName", host == null ? null : host.getFirstName());
            m.put("hostLastName", host == null ? null : host.getLastName());
            m.put("title", r.get("title"));
            m.put("description", r.get("description"));
            m.put("propertyType", r.get("property_type"));
            if (includeAddress) {
                m.put("address", r.get("address"));
                m.put("zip", r.get("zip"));
            }
            m.put("city", r.get("city"));
            m.put("state", r.get("state"));
            m.put("bedrooms", toInt(r.get("bedrooms")));
            m.put("bathrooms", toDecimal(r.get("bathrooms")));
            m.put("monthlyRent", toDecimal(r.get("monthly_rent")));
            m.put("securityDeposit", toDecimal(r.get("security_deposit")));
            m.put("minMonths", toInt(r.get("min_months")));
            m.put("maxMonths", toInt(r.get("max_months")));
            LocalDate available = toLocalDate(r.get("available_from"));
            m.put("availableFrom", available == null ? null : available.toString());
            m.put("furnished", isTrue(r.get("furnished")));
            m.put("petsAllowed", isTrue(r.get("pets_allowed")));
            m.put("utilitiesIncluded", isTrue(r.get("utilities_included")));
            m.put("imageUrl", r.get("image_url"));
            m.put("imageUrls", photosOf(id, (String) r.get("image_url")));
            m.put("status", r.get("status"));
            m.put("createdAt", String.valueOf(r.get("created_at")));
            out.add(m);
        }
        return out;
    }

    // Shared part of an application, plus the lease it belongs to.
    private Map<String, Object> baseApplication(Map<String, Object> a) {
        Long leaseId = toLong(a.get("lease_id"));
        Map<String, Object> lease = findLeaseRow(leaseId);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", toLong(a.get("id")));
        m.put("leaseId", leaseId);
        m.put("leaseTitle", lease == null ? "Deleted listing" : lease.get("title"));
        m.put("leaseCity", lease == null ? null : lease.get("city"));
        m.put("leaseState", lease == null ? null : lease.get("state"));
        m.put("leaseImageUrl", lease == null ? null : lease.get("image_url"));
        m.put("moveInDate", toLocalDate(a.get("move_in_date")).toString());
        int months = toInt(a.get("months"));
        m.put("months", months);
        m.put("moveOutDate", toLocalDate(a.get("move_in_date")).plusMonths(months).toString());
        m.put("monthlyRent", toDecimal(a.get("monthly_rent")));
        m.put("securityDeposit", toDecimal(a.get("security_deposit")));
        m.put("leaseTotal", toDecimal(a.get("lease_total")));
        m.put("status", a.get("status"));
        m.put("hostNote", a.get("host_note"));
        m.put("paid", isTrue(a.get("paid")));
        m.put("confirmed", isTrue(a.get("confirmed")));
        m.put("confirmedAt", a.get("confirmed_at") == null ? null : String.valueOf(a.get("confirmed_at")));
        m.put("messageCount", messageCountFor(toLong(a.get("id"))));
        m.put("createdAt", String.valueOf(a.get("created_at")));
        return m;
    }

    // The lease document is released only once the host confirms.
    private static boolean documentReleased(Map<String, Object> a) {
        return "APPROVED".equals(a.get("status")) && isTrue(a.get("confirmed"));
    }

    // What the tenant sees. The amount due (first month + deposit)
    // and the full street address appear only once the host approves.
    private Map<String, Object> toTenantView(Map<String, Object> a) {
        Map<String, Object> m = baseApplication(a);
        boolean approved = "APPROVED".equals(a.get("status"));
        m.put("amountDue", approved ? toDecimal(a.get("amount_due")) : null);
        if (approved) {
            Map<String, Object> lease = findLeaseRow(toLong(a.get("lease_id")));
            m.put("leaseAddress", lease == null ? null : lease.get("address"));
            m.put("leaseZip", lease == null ? null : lease.get("zip"));
        }
        m.put("hostId", toLong(a.get("host_user_id")));
        m.put("hostName", hostNameOf(a));
        m.put("signatureName", a.get("signature_name"));
        m.put("unreadMessages", unreadMessagesFor(toLong(a.get("id")), toLong(a.get("tenant_user_id"))));
        // The lease agreement PDF is available once the host confirms.
        if (documentReleased(a)) m.put("agreement", agreementOf(a));
        return m;
    }

    // What the host sees: the whole application. Private details
    // (date of birth, income, phone) are only ever sent to this host.
    private Map<String, Object> toHostView(Map<String, Object> a) {
        Map<String, Object> m = baseApplication(a);
        m.put("amountDue", toDecimal(a.get("amount_due")));
        Long tenantId = toLong(a.get("tenant_user_id"));
        User tenant = userRepository.findById(tenantId).orElse(null);
        m.put("tenantId", tenantId);
        m.put("tenantEmail", tenant == null ? null : tenant.getEmail());
        m.put("fullName", a.get("full_name"));
        m.put("phone", a.get("phone"));
        LocalDate dob = toLocalDate(a.get("date_of_birth"));
        m.put("dateOfBirth", dob == null ? null : dob.toString());
        m.put("currentAddress", a.get("current_address"));
        m.put("employer", a.get("employer"));
        m.put("monthlyIncome", a.get("monthly_income") == null ? null : toDecimal(a.get("monthly_income")));
        m.put("occupants", toInt(a.get("occupants")));
        m.put("hasPets", isTrue(a.get("has_pets")));
        m.put("petDetails", a.get("pet_details"));
        m.put("message", a.get("message"));
        m.put("details", parseDetails(a.get("details")));
        m.put("signatureName", a.get("signature_name"));
        m.put("signedAt", a.get("signed_at") == null ? null : String.valueOf(a.get("signed_at")));
        m.put("unreadMessages", unreadMessagesFor(toLong(a.get("id")), toLong(a.get("host_user_id"))));
        if (documentReleased(a)) m.put("agreement", agreementOf(a));
        return m;
    }

    // Everything the lease agreement PDF needs, as signed during the application.
    private Map<String, Object> agreementOf(Map<String, Object> a) {
        Map<String, Object> lease = findLeaseRow(toLong(a.get("lease_id")));
        User host = userRepository.findById(toLong(a.get("host_user_id"))).orElse(null);
        LocalDate moveIn = toLocalDate(a.get("move_in_date"));
        int months = toInt(a.get("months"));

        Map<String, Object> g = new LinkedHashMap<>();
        g.put("applicationId", toLong(a.get("id")));
        g.put("landlordName", host == null ? "" : (nz(host.getFirstName()) + " " + nz(host.getLastName())).trim());
        g.put("landlordEmail", host == null ? null : host.getEmail());
        g.put("tenantName", a.get("full_name"));
        g.put("tenantEmail", tenantEmailOf(a));
        g.put("tenantPhone", a.get("phone"));
        g.put("propertyTitle", lease == null ? null : lease.get("title"));
        g.put("propertyType", lease == null ? null : lease.get("property_type"));
        g.put("address", lease == null ? null : lease.get("address"));
        g.put("city", lease == null ? null : lease.get("city"));
        g.put("state", lease == null ? null : lease.get("state"));
        g.put("zip", lease == null ? null : lease.get("zip"));
        g.put("furnished", lease != null && isTrue(lease.get("furnished")));
        g.put("petsAllowed", lease != null && isTrue(lease.get("pets_allowed")));
        g.put("utilitiesIncluded", lease != null && isTrue(lease.get("utilities_included")));
        g.put("moveInDate", moveIn.toString());
        g.put("moveOutDate", moveIn.plusMonths(months).toString());
        g.put("months", months);
        g.put("monthlyRent", toDecimal(a.get("monthly_rent")));
        g.put("securityDeposit", toDecimal(a.get("security_deposit")));
        g.put("leaseTotal", toDecimal(a.get("lease_total")));
        g.put("amountPaid", toDecimal(a.get("amount_due")));
        g.put("occupants", toInt(a.get("occupants")));
        g.put("hasPets", isTrue(a.get("has_pets")));
        g.put("petDetails", a.get("pet_details"));
        g.put("signatureName", a.get("signature_name"));
        g.put("signedAt", a.get("signed_at") == null ? null : String.valueOf(a.get("signed_at")));
        g.put("approvedAt", a.get("decided_at") == null ? null : String.valueOf(a.get("decided_at")));
        g.put("paidAt", a.get("paid_at") == null ? null : String.valueOf(a.get("paid_at")));
        g.put("confirmedAt", a.get("confirmed_at") == null ? null : String.valueOf(a.get("confirmed_at")));
        return g;
    }

    private String hostNameOf(Map<String, Object> a) {
        return userRepository.findById(toLong(a.get("host_user_id")))
                .map(h -> (nz(h.getFirstName()) + " " + nz(h.getLastName())).trim())
                .orElse("");
    }

    private String leaseTitleOf(Map<String, Object> a) {
        Map<String, Object> lease = findLeaseRow(toLong(a.get("lease_id")));
        return lease == null ? "your lease" : String.valueOf(lease.get("title"));
    }

    private Map<String, Object> parseDetails(Object raw) {
        if (raw == null) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(raw.toString(), new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private String tenantEmailOf(Map<String, Object> a) {
        String email = text(a.get("applicant_email"));
        if (email != null) return email;
        return userRepository.findById(toLong(a.get("tenant_user_id"))).map(User::getEmail).orElse(null);
    }

    private String firstNameOf(Map<String, Object> a) {
        String full = text(a.get("full_name"));
        if (full == null) return "there";
        return full.split("\\s+")[0];
    }

    // Email never blocks the action - if it fails (e.g. locally) we just log it.
    private void sendEmail(String to, String subject, String body) {
        if (to == null) return;
        try {
            emailService.sendSimpleEmail(to, subject, body);
        } catch (Exception e) {
            log.warn("Could not send lease email to {}: {}", to, e.getMessage());
        }
    }

    private static String money(BigDecimal v) {
        return v == null ? "0.00" : v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String normalize(String s) {
        return s == null ? "" : s.trim().replaceAll("\\s+", " ").toLowerCase();
    }

    private static String joinNonEmpty(String sep, String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p == null || p.isBlank()) continue;
            if (sb.length() > 0) sb.append(sep);
            sb.append(p);
        }
        return sb.toString();
    }

    // ============================================================
    // Helpers
    // ============================================================

    private static class LeaseFields {
        String title, description, propertyType, address, city, state, zip;
        int bedrooms, minMonths, maxMonths;
        BigDecimal bathrooms, monthlyRent, securityDeposit;
        LocalDate availableFrom;
        boolean furnished, petsAllowed, utilitiesIncluded;
        List<String> photos;
    }

    private LeaseFields readLeaseFields(Map<String, Object> body) {
        LeaseFields f = new LeaseFields();
        f.title = text(body.get("title"));
        f.description = text(body.get("description"));
        f.propertyType = text(body.get("propertyType"));
        f.address = text(body.get("address"));
        f.city = text(body.get("city"));
        f.state = text(body.get("state"));
        f.zip = text(body.get("zip"));
        Integer bedrooms = intOrNull(body.get("bedrooms"));
        f.bathrooms = decimalOrNull(body.get("bathrooms"));
        f.monthlyRent = decimalOrNull(body.get("monthlyRent"));
        f.securityDeposit = decimalOrNull(body.get("securityDeposit"));
        Integer minMonths = intOrNull(body.get("minMonths"));
        Integer maxMonths = intOrNull(body.get("maxMonths"));
        f.availableFrom = dateOrNull(body.get("availableFrom"));
        f.furnished = isTrue(body.get("furnished"));
        f.petsAllowed = isTrue(body.get("petsAllowed"));
        f.utilitiesIncluded = isTrue(body.get("utilitiesIncluded"));

        if (f.title == null) throw new RuntimeException("Enter a title for the listing.");
        if (f.title.length() > 200) throw new RuntimeException("The title is too long (200 characters max).");
        if (f.propertyType == null || !PROPERTY_TYPES.contains(f.propertyType.toUpperCase())) {
            throw new RuntimeException("Pick a property type.");
        }
        f.propertyType = f.propertyType.toUpperCase();
        if (f.city == null) throw new RuntimeException("Enter the city.");
        if (f.state == null) throw new RuntimeException("Enter the state.");
        f.state = f.state.toUpperCase();
        if (bedrooms == null || bedrooms < 0 || bedrooms > 20) throw new RuntimeException("Enter the number of bedrooms (0 for a studio).");
        f.bedrooms = bedrooms;
        if (f.bathrooms == null || f.bathrooms.compareTo(BigDecimal.ZERO) < 0 || f.bathrooms.compareTo(BigDecimal.valueOf(20)) > 0) {
            throw new RuntimeException("Enter the number of bathrooms.");
        }
        if (f.monthlyRent == null || f.monthlyRent.compareTo(BigDecimal.ONE) < 0) {
            throw new RuntimeException("Monthly rent must be at least $1.");
        }
        if (f.securityDeposit == null) f.securityDeposit = BigDecimal.ZERO;
        if (f.securityDeposit.compareTo(BigDecimal.ZERO) < 0) throw new RuntimeException("The deposit can't be negative.");
        f.minMonths = minMonths == null ? 1 : minMonths;
        f.maxMonths = maxMonths == null ? 12 : maxMonths;
        if (f.minMonths < 1) throw new RuntimeException("The minimum lease is 1 month.");
        if (f.maxMonths > MAX_MONTHS_LIMIT) throw new RuntimeException("The maximum lease is " + MAX_MONTHS_LIMIT + " months.");
        if (f.maxMonths < f.minMonths) throw new RuntimeException("Maximum months can't be less than minimum months.");

        f.photos = photoList(body.get("imageUrls"));
        if (f.photos.isEmpty()) throw new RuntimeException("Add at least one photo.");
        return f;
    }

    // Fills the 18 shared lease columns starting at index `i`; returns the next index.
    private int fillLeaseStatement(PreparedStatement ps, int i, LeaseFields f) throws java.sql.SQLException {
        ps.setString(i++, f.title);
        ps.setString(i++, f.description);
        ps.setString(i++, f.propertyType);
        ps.setString(i++, cut(f.address, 255));
        ps.setString(i++, cut(f.city, 100));
        ps.setString(i++, cut(f.state, 50));
        ps.setString(i++, cut(f.zip, 20));
        ps.setInt(i++, f.bedrooms);
        ps.setBigDecimal(i++, f.bathrooms);
        ps.setBigDecimal(i++, f.monthlyRent);
        ps.setBigDecimal(i++, f.securityDeposit);
        ps.setInt(i++, f.minMonths);
        ps.setInt(i++, f.maxMonths);
        ps.setDate(i++, f.availableFrom == null ? null : Date.valueOf(f.availableFrom));
        ps.setBoolean(i++, f.furnished);
        ps.setBoolean(i++, f.petsAllowed);
        ps.setBoolean(i++, f.utilitiesIncluded);
        ps.setString(i++, f.photos.get(0));
        return i;
    }

    private void savePhotos(Long leaseId, List<String> photos) {
        for (int i = 0; i < photos.size(); i++) {
            jdbc.update("INSERT INTO lease_images (lease_id, image_url, display_order) VALUES (?, ?, ?)",
                    leaseId, photos.get(i), i);
        }
    }

    private List<String> photosOf(Long leaseId, String cover) {
        List<String> urls = jdbc.queryForList(
                "SELECT image_url FROM lease_images WHERE lease_id = ? ORDER BY display_order, id", String.class, leaseId);
        if (urls.isEmpty() && cover != null) urls = new ArrayList<>(List.of(cover));
        return urls;
    }

    private List<String> photoList(Object raw) {
        List<String> urls = new ArrayList<>();
        if (!(raw instanceof List)) return urls;
        for (Object o : (List<?>) raw) {
            String u = text(o);
            if (u == null) continue;
            if (!r2StorageService.isOwnUrl(u)) throw new RuntimeException("Photos must be uploaded through bhookme.");
            if (!urls.contains(u)) urls.add(u);
        }
        if (urls.size() > MAX_PHOTOS_PER_LEASE) {
            throw new RuntimeException("A listing can have up to " + MAX_PHOTOS_PER_LEASE + " photos.");
        }
        return urls;
    }

    private Map<String, Object> findLeaseRow(Long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM leases WHERE id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Map<String, Object> findOwnLease(String hostEmail, Long id) {
        User host = findUser(hostEmail);
        Map<String, Object> row = findLeaseRow(id);
        if (row == null || isTrue(row.get("deleted"))) throw new RuntimeException("Lease listing not found");
        if (!toLong(row.get("host_user_id")).equals(host.getId())) {
            throw new RuntimeException("You can only change your own listings.");
        }
        return row;
    }

    private Map<String, Object> findApplicationRow(Long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM lease_applications WHERE id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Map<String, Object> findHostApplication(String hostEmail, Long id) {
        User host = findUser(hostEmail);
        Map<String, Object> app = findApplicationRow(id);
        if (app == null || !toLong(app.get("host_user_id")).equals(host.getId())) {
            throw new RuntimeException("Application not found");
        }
        return app;
    }

    private User findUser(String email) {
        if (email == null) throw new RuntimeException("Please log in.");
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("Account not found"));
    }

    private static String text(Object value) {
        if (value == null) return null;
        String s = value.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private static String cut(String s, int max) {
        return s == null ? null : (s.length() > max ? s.substring(0, max) : s);
    }

    private static Integer intOrNull(Object value) {
        String s = text(value);
        if (s == null) return null;
        try { return new BigDecimal(s).intValueExact(); } catch (Exception e) { return null; }
    }

    private static BigDecimal decimalOrNull(Object value) {
        String s = text(value);
        if (s == null) return null;
        try { return new BigDecimal(s); } catch (Exception e) { return null; }
    }

    private static LocalDate dateOrNull(Object value) {
        String s = text(value);
        if (s == null) return null;
        try { return LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s); } catch (Exception e) { return null; }
    }

    private static LocalDate toLocalDate(Object value) {
        if (value == null) return null;
        if (value instanceof Date d) return d.toLocalDate();
        if (value instanceof LocalDate d) return d;
        return dateOrNull(value);
    }

    private static boolean isTrue(Object value) {
        if (value == null) return false;
        if (value instanceof Boolean b) return b;
        if (value instanceof Number n) return n.intValue() != 0;
        String s = value.toString().trim();
        return s.equalsIgnoreCase("true") || s.equals("1") || s.equalsIgnoreCase("yes");
    }

    private static Long toLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.longValue();
        return Long.valueOf(value.toString());
    }

    private static int toInt(Object value) {
        if (value == null) return 0;
        if (value instanceof Number n) return n.intValue();
        return Integer.parseInt(value.toString());
    }

    private static BigDecimal toDecimal(Object value) {
        if (value == null) return BigDecimal.ZERO;
        if (value instanceof BigDecimal b) return b;
        return new BigDecimal(value.toString());
    }
}