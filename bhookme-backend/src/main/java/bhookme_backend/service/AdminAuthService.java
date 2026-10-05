package bhookme_backend.service;

import bhookme_backend.dto.AdminAuthResponse;
import bhookme_backend.dto.AdminLoginRequest;
import bhookme_backend.dto.CreateAdminRequest;
import bhookme_backend.model.Admin;
import bhookme_backend.model.AdminRole;
import bhookme_backend.repository.AdminRepository;
import bhookme_backend.security.JwtUtil;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AdminAuthService {

    // Two-step login (password, then authenticator-app code).
    private static final long CHALLENGE_TTL_MS = 5 * 60 * 1000L; // 5 minutes to enter the code
    private static final int MAX_CODE_ATTEMPTS = 5;
    private static final String TOTP_ISSUER = "bhookme";

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final TotpService totpService;
    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    // Password-checked logins waiting for their 6-digit code. Kept in memory:
    // a backend restart simply means signing in again.
    private final Map<String, Challenge> challenges = new ConcurrentHashMap<>();

    private static class Challenge {
        final String email;
        final boolean setup;
        final long expiresAt;
        int attempts;

        Challenge(String email, boolean setup) {
            this.email = email;
            this.setup = setup;
            this.expiresAt = System.currentTimeMillis() + CHALLENGE_TTL_MS;
        }
    }

    public AdminAuthService(AdminRepository adminRepository, PasswordEncoder passwordEncoder, JwtUtil jwtUtil,
                            TotpService totpService, JdbcTemplate jdbc) {
        this.adminRepository = adminRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.totpService = totpService;
        this.jdbc = jdbc;
    }

    // Both login steps arrive here.
    //  Step 1 (email + password): never returns a token. Returns either
    //    {totpRequired: true, challengeId}            - app already set up
    //    {setupRequired: true, challengeId, secret, otpauthUrl} - first time: scan QR
    //  Step 2 (challengeId + code): returns the normal AdminAuthResponse with token.
    public Object login(AdminLoginRequest request) {
        if (request.getChallengeId() != null && !request.getChallengeId().isBlank()) {
            return verifyCode(request.getChallengeId(), request.getCode());
        }
        return checkPassword(request);
    }

    private Map<String, Object> checkPassword(AdminLoginRequest request) {
        if (request.getEmail() == null || request.getPassword() == null) {
            throw new RuntimeException("Invalid email or password");
        }
        Admin admin = adminRepository.findByEmail(request.getEmail().trim())
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), admin.getPasswordHash())) {
            throw new RuntimeException("Invalid email or password");
        }
        if (!Boolean.TRUE.equals(admin.getIsActive())) {
            throw new RuntimeException("This account has been deactivated");
        }

        cleanUpChallenges();
        Map<String, Object> totp = totpRow(admin.getId());
        boolean enabled = Boolean.TRUE.equals(asBool(totp.get("totp_enabled")));
        String secret = (String) totp.get("totp_secret");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("email", admin.getEmail());

        if (enabled && secret != null && !secret.isBlank()) {
            result.put("totpRequired", true);
            result.put("challengeId", newChallenge(admin.getEmail(), false));
            return result;
        }

        // First time (or after an HR reset): create a secret to scan. It only
        // becomes active once the admin proves they scanned it by entering a code.
        if (secret == null || secret.isBlank()) {
            secret = totpService.generateSecret();
            jdbc.update("UPDATE admins SET totp_secret = ?, totp_enabled = 0 WHERE id = ?", secret, admin.getId());
        }
        result.put("setupRequired", true);
        result.put("challengeId", newChallenge(admin.getEmail(), true));
        result.put("secret", secret);
        result.put("otpauthUrl", otpauthUrl(admin.getEmail(), secret));
        return result;
    }

    private AdminAuthResponse verifyCode(String challengeId, String rawCode) {
        Challenge challenge = challenges.get(challengeId);
        if (challenge == null || challenge.expiresAt < System.currentTimeMillis()) {
            challenges.remove(challengeId);
            throw new RuntimeException("Your sign-in expired. Please enter your email and password again.");
        }

        String code = rawCode == null ? "" : rawCode.replaceAll("\\s", "");
        if (!code.matches("\\d{6}")) {
            throw new RuntimeException("Enter the 6-digit code from your authenticator app.");
        }

        Admin admin = adminRepository.findByEmail(challenge.email)
                .orElseThrow(() -> new RuntimeException("Admin account not found"));
        if (!Boolean.TRUE.equals(admin.getIsActive())) {
            challenges.remove(challengeId);
            throw new RuntimeException("This account has been deactivated");
        }

        String secret = (String) totpRow(admin.getId()).get("totp_secret");
        if (secret == null || secret.isBlank() || !totpService.verifyTOTP(secret, code)) {
            challenge.attempts++;
            if (challenge.attempts >= MAX_CODE_ATTEMPTS) {
                challenges.remove(challengeId);
                throw new RuntimeException("Too many wrong codes. Please sign in again.");
            }
            throw new RuntimeException("That code isn't right. Check your authenticator app and try again.");
        }

        challenges.remove(challengeId);
        if (challenge.setup) {
            jdbc.update("UPDATE admins SET totp_enabled = 1 WHERE id = ?", admin.getId());
        }

        String token = jwtUtil.generateToken(admin.getEmail());
        return new AdminAuthResponse(token, admin.getId(), admin.getEmail(),
                admin.getFirstName(), admin.getLastName(), admin.getRole().name());
    }

    public AdminAuthResponse getProfile(String email) {
        Admin admin = adminRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Admin account not found"));
        return new AdminAuthResponse(null, admin.getId(), admin.getEmail(),
                admin.getFirstName(), admin.getLastName(), admin.getRole().name());
    }

    // Creates a new ADMIN or HR account. This is HR's core job once
    // the HR dashboard exists, so it's normally restricted to callers
    // with role HR. The one exception is bootstrap mode: while the
    // admins table is still completely empty, there is no HR account
    // yet to log in as and create the first one, so this call is
    // allowed through with no caller at all (creatorEmail == null).
    // Once at least one admin/HR row exists, bootstrap mode closes
    // permanently and every further call must come from an
    // authenticated HR account. New accounts set up their authenticator
    // app on first sign-in.
    public AdminAuthResponse createAdmin(String creatorEmail, CreateAdminRequest request) {
        boolean bootstrapMode = adminRepository.count() == 0;

        if (!bootstrapMode) {
            requireHR(creatorEmail);
        }

        if (adminRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("An admin account with this email already exists");
        }
        if (request.getPassword() == null || request.getPassword().length() < 6) {
            throw new RuntimeException("Password must be at least 6 characters");
        }

        AdminRole role;
        try {
            role = AdminRole.valueOf(request.getRole().toUpperCase());
        } catch (Exception e) {
            throw new RuntimeException("Role must be ADMIN or HR");
        }

        Admin admin = new Admin();
        admin.setEmail(request.getEmail());
        admin.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        admin.setFirstName(request.getFirstName());
        admin.setLastName(request.getLastName());
        admin.setRole(role);
        admin.setIsActive(true);

        Admin saved = adminRepository.save(admin);
        return new AdminAuthResponse(null, saved.getId(), saved.getEmail(),
                saved.getFirstName(), saved.getLastName(), saved.getRole().name());
    }

    // HR-only: every admin/HR account that exists, newest first - for
    // the HR dashboard's Accounts tab. Includes whether each has set up
    // their authenticator app.
    public List<Map<String, Object>> getAllAccounts(String callerEmail) {
        requireHR(callerEmail);
        Map<Long, Boolean> enabledById = new HashMap<>();
        for (Map<String, Object> row : jdbc.queryForList("SELECT id, totp_enabled FROM admins")) {
            enabledById.put(((Number) row.get("id")).longValue(), Boolean.TRUE.equals(asBool(row.get("totp_enabled"))));
        }
        List<Map<String, Object>> accounts = new ArrayList<>();
        adminRepository.findAll().stream()
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .forEach(a -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", a.getId());
                    m.put("email", a.getEmail());
                    m.put("firstName", a.getFirstName());
                    m.put("lastName", a.getLastName());
                    m.put("role", a.getRole().name());
                    m.put("totpEnabled", enabledById.getOrDefault(a.getId(), false));
                    accounts.add(m);
                });
        return accounts;
    }

    // HR-only: clear an account's authenticator app (lost phone). On their
    // next sign-in they scan a new QR code.
    public Map<String, Object> resetTwoFactor(String callerEmail, Long adminId) {
        requireHR(callerEmail);
        int updated = jdbc.update("UPDATE admins SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?", adminId);
        if (updated == 0) {
            throw new RuntimeException("Account not found");
        }
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "Two-step sign-in was reset. They'll scan a new QR code on their next sign-in.");
        return result;
    }

    // ---------- helpers ----------

    private void requireHR(String email) {
        Admin caller = adminRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Admin account not found"));
        if (caller.getRole() != AdminRole.HR) {
            throw new RuntimeException("Only HR accounts can perform this action");
        }
    }

    private Map<String, Object> totpRow(Long adminId) {
        return jdbc.queryForMap("SELECT totp_secret, totp_enabled FROM admins WHERE id = ?", adminId);
    }

    private String newChallenge(String email, boolean setup) {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        StringBuilder id = new StringBuilder();
        for (byte b : bytes) id.append(String.format("%02x", b));
        challenges.put(id.toString(), new Challenge(email, setup));
        return id.toString();
    }

    private void cleanUpChallenges() {
        long now = System.currentTimeMillis();
        challenges.entrySet().removeIf(e -> e.getValue().expiresAt < now);
    }

    private String otpauthUrl(String email, String secret) {
        String label = URLEncoder.encode(TOTP_ISSUER + ":" + email, StandardCharsets.UTF_8).replace("+", "%20");
        return "otpauth://totp/" + label + "?secret=" + secret + "&issuer=" + TOTP_ISSUER
                + "&algorithm=SHA1&digits=6&period=30";
    }

    private Boolean asBool(Object value) {
        if (value == null) return false;
        if (value instanceof Boolean) return (Boolean) value;
        if (value instanceof Number) return ((Number) value).intValue() != 0;
        return "true".equalsIgnoreCase(value.toString()) || "1".equals(value.toString());
    }
}