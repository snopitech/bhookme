package bhookme_backend.service;

import bhookme_backend.dto.AuthResponse;
import bhookme_backend.dto.LoginRequest;
import bhookme_backend.dto.RegisterRequest;
import bhookme_backend.model.PasswordResetToken;
import bhookme_backend.model.User;
import bhookme_backend.repository.PasswordResetTokenRepository;
import bhookme_backend.repository.UserRepository;
import bhookme_backend.security.JwtUtil;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final EmailService emailService;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final PasswordResetTokenRepository passwordResetTokenRepository;

    // ===== Microsoft config. Property names are bhookme.ms.* (not
    // microsoft.client.*) so they cannot collide with the stray
    // MICROSOFT_CLIENT_ID / MICROSOFT_TENANT_ID OS env vars that
    // were left on this machine by a previous session. Spring's
    // relaxed binding would otherwise match them and override the
    // values from .env. =====
    @Value("${bhookme.ms.client-id}")
    private String microsoftClientId;

    @Value("${bhookme.ms.tenant-id}")
    private String microsoftTenantId;

    @Value("${bhookme.ms.client-secret}")
    private String microsoftClientSecret;

    // ===== Yahoo config. Same bhookme.* prefix pattern as Microsoft
    // for the same reason - avoid any relaxed-binding collision with
    // stray YAHOO_CLIENT_ID env vars that might exist. =====
    @Value("${bhookme.yahoo.client-id}")
    private String yahooClientId;

    @Value("${bhookme.yahoo.client-secret}")
    private String yahooClientSecret;

    @Value("${bhookme.yahoo.redirect-uri}")
    private String yahooRedirectUri;

    // ===== Frontend URL for building the host password-reset link.
    // Defaults to production so prod behavior is unchanged. Local
    // dev sets BHOOKME_FRONTEND_URL=http://localhost:5173 in .env
    // to make the emailed reset links point at the local frontend.
    @Value("${bhookme.frontend.url:https://bhookme.com}")
    private String frontendUrl;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtUtil jwtUtil,
                       EmailService emailService,
                       PasswordResetTokenRepository passwordResetTokenRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.emailService = emailService;
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
        this.passwordResetTokenRepository = passwordResetTokenRepository;
    }

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("An account with this email already exists");
        }

        User user = new User();
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setFirstName(request.getFirstName());
        user.setLastName(request.getLastName());
        user.setPhone(request.getPhone());
        user.setIsHost(false);
        user.setIsActive(true);

        User saved = userRepository.save(user);

        try {
            emailService.sendWelcomeEmail(saved.getEmail(), saved.getFirstName());
        } catch (Exception e) {
            System.err.println("Failed to send welcome email to " + saved.getEmail() + ": " + e.getMessage());
        }

        String token = jwtUtil.generateToken(saved.getEmail());

        return new AuthResponse(token, saved.getId(), saved.getEmail(),
                saved.getFirstName(), saved.getLastName(), saved.getIsHost());
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new RuntimeException("Invalid email or password");
        }

        if (!user.getIsActive()) {
            throw new RuntimeException("This account has been deactivated");
        }

        String token = jwtUtil.generateToken(user.getEmail());

        return new AuthResponse(token, user.getId(), user.getEmail(),
                user.getFirstName(), user.getLastName(), user.getIsHost());
    }

    /**
     * Google sign-in via Google's /tokeninfo endpoint (eStore pattern).
     */
    public AuthResponse googleLogin(String idTokenString) {
        try {
            if (idTokenString == null || idTokenString.isBlank()) {
                throw new RuntimeException("Missing Google ID token");
            }

            System.out.println("[Google] Verifying ID token (first 50 chars): "
                    + idTokenString.substring(0, Math.min(50, idTokenString.length())) + "...");

            Map<String, Object> userInfo = verifyGoogleToken(idTokenString);

            if (userInfo == null || !userInfo.containsKey("email")) {
                throw new RuntimeException("Invalid Google token");
            }

            String email = String.valueOf(userInfo.get("email"));
            String firstName = userInfo.get("given_name") != null
                    ? String.valueOf(userInfo.get("given_name")) : "Google";
            String lastName = userInfo.get("family_name") != null
                    ? String.valueOf(userInfo.get("family_name")) : "User";

            System.out.println("[Google] Verified user email: " + email);

            User user = userRepository.findByEmail(email).orElseGet(() -> {
                User newUser = new User();
                newUser.setEmail(email);
                newUser.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
                newUser.setFirstName(firstName);
                newUser.setLastName(lastName);
                newUser.setIsHost(false);
                newUser.setIsActive(true);
                User saved = userRepository.save(newUser);
                try {
                    emailService.sendWelcomeEmail(saved.getEmail(), saved.getFirstName());
                } catch (Exception e) {
                    System.err.println("Failed to send welcome email to " + saved.getEmail() + ": " + e.getMessage());
                }
                return saved;
            });

            String token = jwtUtil.generateToken(user.getEmail());
            return new AuthResponse(token, user.getId(), user.getEmail(),
                    user.getFirstName(), user.getLastName(), user.getIsHost());
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Google sign-in failed: " + e.getMessage());
        }
    }

    private Map<String, Object> verifyGoogleToken(String idToken) {
        try {
            String url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken;

            String responseBody = restTemplate.getForObject(url, String.class);

            if (responseBody == null || responseBody.isBlank()) {
                System.err.println("[Google] /tokeninfo returned empty response");
                return null;
            }

            Map<String, Object> claims = objectMapper.readValue(
                    responseBody,
                    new TypeReference<Map<String, Object>>() {});

            if (claims.containsKey("error")) {
                System.err.println("[Google] /tokeninfo error: " + claims.get("error"));
                return null;
            }

            return claims;
        } catch (Exception e) {
            System.err.println("[Google] Failed to verify ID token: " + e.getMessage());
            return null;
        }
    }

    // ============================================================
    // ===== MICROSOFT SIGN-IN =====
    // ============================================================

    public AuthResponse microsoftLogin(String idTokenString) {
        try {
            if (idTokenString == null || idTokenString.isBlank()) {
                throw new RuntimeException("Missing Microsoft ID token");
            }

            System.out.println("[Microsoft] Verifying ID token (first 50 chars): "
                    + idTokenString.substring(0, Math.min(50, idTokenString.length())) + "...");

            Map<String, Object> userInfo = verifyMicrosoftToken(idTokenString);

            if (userInfo == null || !userInfo.containsKey("email")) {
                throw new RuntimeException("Invalid Microsoft token");
            }

            String email = String.valueOf(userInfo.get("email"));
            String firstName = String.valueOf(userInfo.getOrDefault("given_name", "Microsoft"));
            String lastName = String.valueOf(userInfo.getOrDefault("family_name", "User"));

            System.out.println("[Microsoft] Verified user email: " + email);

            User user = userRepository.findByEmail(email).orElseGet(() -> {
                User newUser = new User();
                newUser.setEmail(email);
                newUser.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
                newUser.setFirstName(firstName);
                newUser.setLastName(lastName);
                newUser.setIsHost(false);
                newUser.setIsActive(true);
                User saved = userRepository.save(newUser);
                try {
                    emailService.sendWelcomeEmail(saved.getEmail(), saved.getFirstName());
                } catch (Exception e) {
                    System.err.println("Failed to send welcome email to " + saved.getEmail() + ": " + e.getMessage());
                }
                return saved;
            });

            String token = jwtUtil.generateToken(user.getEmail());
            return new AuthResponse(token, user.getId(), user.getEmail(),
                    user.getFirstName(), user.getLastName(), user.getIsHost());
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Microsoft sign-in failed: " + e.getMessage());
        }
    }

    private Map<String, Object> verifyMicrosoftToken(String idToken) {
        try {
            String[] parts = idToken.split("\\.");
            if (parts.length != 3) {
                System.err.println("[Microsoft] ID token is not a valid JWT");
                return null;
            }

            String payloadJson = new String(
                    Base64.getUrlDecoder().decode(parts[1]),
                    StandardCharsets.UTF_8);

            Map<String, Object> claims = objectMapper.readValue(
                    payloadJson,
                    new TypeReference<Map<String, Object>>() {});

            String aud = String.valueOf(claims.get("aud"));
            if (!microsoftClientId.equals(aud)) {
                System.err.println("[Microsoft] Audience mismatch: expected "
                        + microsoftClientId + ", got " + aud);
                return null;
            }

            String iss = String.valueOf(claims.get("iss"));
            if (iss == null || !iss.contains("login.microsoftonline.com")) {
                System.err.println("[Microsoft] Issuer mismatch: " + iss);
                return null;
            }

            Object expObj = claims.get("exp");
            if (expObj instanceof Number) {
                long exp = ((Number) expObj).longValue();
                long now = System.currentTimeMillis() / 1000;
                if (now > exp) {
                    System.err.println("[Microsoft] Token has expired");
                    return null;
                }
            }

            String email = null;
            for (String key : new String[]{"email", "preferred_username", "upn", "unique_name"}) {
                Object v = claims.get(key);
                if (v != null && !v.toString().isEmpty()) {
                    email = v.toString();
                    break;
                }
            }

            if (email == null || email.isEmpty()) {
                System.err.println("[Microsoft] No email in claims");
                return null;
            }

            String givenName = claims.get("given_name") != null
                    ? claims.get("given_name").toString() : null;
            String familyName = claims.get("family_name") != null
                    ? claims.get("family_name").toString() : null;

            if (givenName == null || familyName == null) {
                Object nameObj = claims.get("name");
                if (nameObj != null) {
                    String fullName = nameObj.toString();
                    int spaceIdx = fullName.indexOf(' ');
                    if (spaceIdx > 0) {
                        if (givenName == null) givenName = fullName.substring(0, spaceIdx);
                        if (familyName == null) familyName = fullName.substring(spaceIdx + 1);
                    } else {
                        if (givenName == null) givenName = fullName;
                        if (familyName == null) familyName = "";
                    }
                }
            }

            Map<String, Object> normalized = new HashMap<>();
            normalized.put("email", email);
            normalized.put("given_name", givenName != null ? givenName : "Microsoft");
            normalized.put("family_name", familyName != null ? familyName : "User");
            return normalized;

        } catch (Exception e) {
            System.err.println("[Microsoft] Error verifying token: " + e.getMessage());
            return null;
        }
    }

    // ============================================================
    // ===== YAHOO SIGN-IN =====
    // ============================================================
    public AuthResponse yahooLogin(String email, String firstName, String lastName) {
        try {
            if (email == null || email.isBlank()) {
                throw new RuntimeException("Missing email from Yahoo");
            }

            System.out.println("[Yahoo] Signing in user: " + email);

            User user = userRepository.findByEmail(email).orElseGet(() -> {
                User newUser = new User();
                newUser.setEmail(email);
                newUser.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
                newUser.setFirstName(firstName != null && !firstName.isBlank() ? firstName : "Yahoo");
                newUser.setLastName(lastName != null && !lastName.isBlank() ? lastName : "User");
                newUser.setIsHost(false);
                newUser.setIsActive(true);
                User saved = userRepository.save(newUser);
                try {
                    emailService.sendWelcomeEmail(saved.getEmail(), saved.getFirstName());
                } catch (Exception e) {
                    System.err.println("Failed to send welcome email to " + saved.getEmail() + ": " + e.getMessage());
                }
                return saved;
            });

            String token = jwtUtil.generateToken(user.getEmail());
            return new AuthResponse(token, user.getId(), user.getEmail(),
                    user.getFirstName(), user.getLastName(), user.getIsHost());
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Yahoo sign-in failed: " + e.getMessage());
        }
    }

    // ============================================================
    // ===== SET PASSWORD =====
    // ============================================================
    public void setPassword(String email, String newPassword) {
        if (newPassword == null || newPassword.length() < 6) {
            throw new RuntimeException("Password must be at least 6 characters");
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Account not found"));

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    // ============================================================
    // ===== HOST PASSWORD RESET =====
    // @Transactional is REQUIRED here because deleteAllForUser is a
    // @Modifying JPQL query - Spring throws "Executing an
    // update/delete query" otherwise.
    // ============================================================

    @Transactional
    public String createHostResetToken(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }

        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null || !Boolean.TRUE.equals(user.getIsHost())) {
            return null;
        }

        passwordResetTokenRepository.deleteAllForUser(user.getId());

        String token = UUID.randomUUID().toString();
        PasswordResetToken resetToken = new PasswordResetToken(
                token,
                user.getId(),
                LocalDateTime.now().plusHours(24)
        );
        passwordResetTokenRepository.save(resetToken);

        // Reset link points at frontendUrl - production by default,
        // overridable per environment via BHOOKME_FRONTEND_URL.
        String resetUrl = frontendUrl + "/host-reset-password?token=" + token;
        try {
            emailService.sendHostPasswordResetEmail(user.getEmail(), user.getFirstName(), resetUrl);
        } catch (Exception e) {
            System.err.println("[HostReset] Failed to send reset email to " + user.getEmail() + ": " + e.getMessage());
        }

        return token;
    }

    @Transactional
    public AuthResponse resetHostPassword(String token, String newPassword) {
        if (token == null || token.isBlank()) {
            throw new RuntimeException("Missing reset token");
        }
        if (newPassword == null || newPassword.length() < 6) {
            throw new RuntimeException("Password must be at least 6 characters");
        }

        PasswordResetToken resetToken = passwordResetTokenRepository.findByToken(token)
                .orElseThrow(() -> new RuntimeException("This reset link is invalid."));

        if (resetToken.isUsed()) {
            throw new RuntimeException("This reset link has already been used.");
        }
        if (resetToken.isExpired()) {
            throw new RuntimeException("This reset link has expired. Please request a new one.");
        }

        User user = userRepository.findById(resetToken.getUserId())
                .orElseThrow(() -> new RuntimeException("Account not found."));

        if (!Boolean.TRUE.equals(user.getIsHost())) {
            throw new RuntimeException("This reset link is invalid.");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        resetToken.setUsed(true);
        passwordResetTokenRepository.save(resetToken);

        String jwtToken = jwtUtil.generateToken(user.getEmail());
        return new AuthResponse(jwtToken, user.getId(), user.getEmail(),
                user.getFirstName(), user.getLastName(), user.getIsHost());
    }
}