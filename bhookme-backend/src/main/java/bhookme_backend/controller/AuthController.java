package bhookme_backend.controller;

import bhookme_backend.dto.AuthResponse;
import bhookme_backend.dto.GoogleAuthRequest;
import bhookme_backend.dto.LoginRequest;
import bhookme_backend.dto.RegisterRequest;
import bhookme_backend.model.User;
import bhookme_backend.repository.UserRepository;
import bhookme_backend.security.JwtUtil;
import bhookme_backend.service.AuthService;
import bhookme_backend.service.EmailService;
import bhookme_backend.service.TotpService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final TotpService totpService;
    private final JwtUtil jwtUtil;

    public AuthController(AuthService authService, UserRepository userRepository,
                           PasswordEncoder passwordEncoder, EmailService emailService,
                           TotpService totpService, JwtUtil jwtUtil) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
        this.totpService = totpService;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest request) {
        try {
            return ResponseEntity.ok(authService.register(request));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        try {
            return ResponseEntity.ok(authService.login(request));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PostMapping("/google")
    public ResponseEntity<?> google(@RequestBody GoogleAuthRequest request) {
        try {
            return ResponseEntity.ok(authService.googleLogin(request.getIdToken()));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // ============================================================
    // ===== MICROSOFT SIGN-IN =====
    // Accepts { "token": "<MSAL ID token>" } - same shape as the
    // eStore's /api/auth/microsoft endpoint. The frontend (MSAL.js)
    // obtains an ID token via loginPopup(), posts it here, and we
    // verify its claims + issue our own JWT.
    // ============================================================
    @PostMapping("/microsoft")
    public ResponseEntity<?> microsoft(@RequestBody Map<String, String> request) {
        try {
            String idToken = request.get("token");
            return ResponseEntity.ok(authService.microsoftLogin(idToken));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Public: lets the "Become a host" page decide which screen to
    // show next, before the visitor has entered a password.
    @GetMapping("/check-host")
    public ResponseEntity<?> checkHostStatus(@RequestParam("email") String email) {
        Map<String, Object> response = new HashMap<>();
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            response.put("accountExists", false);
            response.put("isHost", false);
        } else {
            response.put("accountExists", true);
            response.put("isHost", Boolean.TRUE.equals(user.getIsHost()));
        }
        return ResponseEntity.ok(response);
    }

    // ============================================================
    // ===== SET PASSWORD =====
    // Authenticated only (enforced in SecurityConfig ahead of the
    // blanket /api/auth/** permitAll). Lets a logged-in user (however
    // they signed in - email/password, Google, Microsoft) set a
    // separate password on their own account, used for host-login.
    // Authentication.getName() is their verified email from the JWT,
    // set by JwtAuthenticationFilter - never trusted from the request
    // body, so this can only ever change the caller's own password.
    // ============================================================
    @PutMapping("/set-password")
    public ResponseEntity<?> setPassword(Authentication authentication, @RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            authService.setPassword(authentication.getName(), request.get("newPassword"));
            response.put("success", true);
            response.put("message", "Password set successfully");
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            response.put("success", false);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/host-login")
    public ResponseEntity<?> hostLogin(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String email = request.get("email");
            String password = request.get("password");

            User user = userRepository.findByEmail(email).orElse(null);
            if (user == null) {
                response.put("success", false);
                response.put("message", "User not found");
                return ResponseEntity.badRequest().body(response);
            }

            if (!Boolean.TRUE.equals(user.getIsHost())) {
                response.put("success", false);
                response.put("message", "This account is not a host account");
                return ResponseEntity.badRequest().body(response);
            }

            if (!passwordEncoder.matches(password, user.getPasswordHash())) {
                response.put("success", false);
                response.put("message", "Invalid password");
                return ResponseEntity.badRequest().body(response);
            }

            String totpSecret = user.getTotpSecret();
            if (totpSecret == null || totpSecret.isEmpty()) {
                totpSecret = totpService.generateSecret();
                user.setTotpSecret(totpSecret);
                user.setTotpEnabled(true);
                userRepository.save(user);
            }

            String code = totpService.generateTOTP(totpSecret);

            String subject = "Your bhookme Host Login Verification Code";
            String body = "Hi " + user.getFirstName() + ",\n\n"
                    + "You are trying to access your host dashboard.\n\n"
                    + "Your verification code is: " + code + "\n\n"
                    + "This code is valid for a few minutes.\n\n"
                    + "If you did not request this, please ignore this email.\n\n"
                    + "- The bhookme team";
            emailService.sendSimpleEmail(email, subject, body);

            response.put("success", true);
            response.put("message", "Verification code sent to your email");
            response.put("email", email);
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error sending verification code: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/host-verify-totp")
    public ResponseEntity<?> hostVerifyTotp(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String email = request.get("email");
            String code = request.get("code");

            User user = userRepository.findByEmail(email).orElse(null);
            if (user == null) {
                response.put("success", false);
                response.put("message", "User not found");
                return ResponseEntity.badRequest().body(response);
            }

            String totpSecret = user.getTotpSecret();
            if (totpSecret == null || totpSecret.isEmpty()) {
                response.put("success", false);
                response.put("message", "TOTP not set up for this user");
                return ResponseEntity.badRequest().body(response);
            }

            if (!totpService.verifyTOTP(totpSecret, code)) {
                response.put("success", false);
                response.put("message", "Invalid verification code. Please try again.");
                return ResponseEntity.badRequest().body(response);
            }

            String jwtToken = jwtUtil.generateToken(user.getEmail());

            response.put("success", true);
            response.put("token", jwtToken);
            response.put("userId", user.getId());
            response.put("email", user.getEmail());
            response.put("firstName", user.getFirstName());
            response.put("lastName", user.getLastName());
            response.put("isHost", user.getIsHost());
            response.put("message", "Verification successful");
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error verifying code: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/host-resend-totp")
    public ResponseEntity<?> hostResendTotp(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String email = request.get("email");

            User user = userRepository.findByEmail(email).orElse(null);
            if (user == null) {
                response.put("success", false);
                response.put("message", "User not found");
                return ResponseEntity.badRequest().body(response);
            }

            String totpSecret = user.getTotpSecret();
            if (totpSecret == null || totpSecret.isEmpty()) {
                response.put("success", false);
                response.put("message", "TOTP not set up for this user");
                return ResponseEntity.badRequest().body(response);
            }

            String code = totpService.generateTOTP(totpSecret);

            String subject = "Your bhookme Host Login Verification Code (Resent)";
            String body = "Hi " + user.getFirstName() + ",\n\n"
                    + "You requested a new verification code.\n\n"
                    + "Your verification code is: " + code + "\n\n"
                    + "This code is valid for a few minutes.\n\n"
                    + "- The bhookme team";
            emailService.sendSimpleEmail(email, subject, body);

            response.put("success", true);
            response.put("message", "New verification code sent to your email");
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error resending code: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    // ============================================================
    // ===== HOST FORGOT / RESET PASSWORD =====
    // Two endpoints matching the flow in the host login page:
    //  1. POST /api/auth/host-forgot-password  { email }
    //     Sends a reset link to the host's email if they exist.
    //     Always returns success (so we don't leak which emails
    //     have host accounts).
    //  2. POST /api/auth/host-reset-password  { token, newPassword }
    //     Validates the token, updates the password, marks the
    //     token used, and returns a session JWT (auto-login).
    // ============================================================

    @PostMapping("/host-forgot-password")
    public ResponseEntity<?> hostForgotPassword(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String email = request.get("email");
            authService.createHostResetToken(email);
            response.put("success", true);
            response.put("message", "If a host account exists with this email, we've sent a reset link.");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[HostReset] host-forgot-password failed: " + e.getMessage());
            response.put("success", true);
            response.put("message", "If a host account exists with this email, we've sent a reset link.");
            return ResponseEntity.ok(response);
        }
    }

    @PostMapping("/host-reset-password")
    public ResponseEntity<?> hostResetPassword(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            String token = request.get("token");
            String newPassword = request.get("newPassword");
            AuthResponse auth = authService.resetHostPassword(token, newPassword);

            response.put("success", true);
            response.put("token", auth.getToken());
            response.put("userId", auth.getUserId());
            response.put("email", auth.getEmail());
            response.put("firstName", auth.getFirstName());
            response.put("lastName", auth.getLastName());
            response.put("isHost", auth.getIsHost());
            response.put("message", "Password changed successfully");
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            response.put("success", false);
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    private ResponseEntity<?> error(RuntimeException e) {
        Map<String, String> body = new HashMap<>();
        body.put("message", e.getMessage());
        return ResponseEntity.badRequest().body(body);
    }
}