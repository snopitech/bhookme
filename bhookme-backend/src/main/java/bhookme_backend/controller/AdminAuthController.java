package bhookme_backend.controller;

import bhookme_backend.dto.AdminLoginRequest;
import bhookme_backend.dto.CreateAdminRequest;
import bhookme_backend.service.AdminAuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/admin-auth")
public class AdminAuthController {

    private final AdminAuthService adminAuthService;

    public AdminAuthController(AdminAuthService adminAuthService) {
        this.adminAuthService = adminAuthService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AdminLoginRequest request) {
        try {
            return ResponseEntity.ok(adminAuthService.login(request));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        try {
            return ResponseEntity.ok(adminAuthService.getProfile(authentication.getName()));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Public only while the admins table is completely empty
    // (bootstrap mode - see AdminAuthService.createAdmin). Once the
    // first account exists, this requires an authenticated HR caller,
    // enforced inside the service using the token's email.
    @PostMapping("/create")
    public ResponseEntity<?> create(@RequestBody CreateAdminRequest request, Authentication authentication) {
        try {
            String creatorEmail = authentication != null ? authentication.getName() : null;
            return ResponseEntity.ok(adminAuthService.createAdmin(creatorEmail, request));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // HR-only: list every admin/HR account - for the HR dashboard's
    // Accounts tab.
    @GetMapping("/accounts")
    public ResponseEntity<?> accounts(Authentication authentication) {
        try {
            return ResponseEntity.ok(adminAuthService.getAllAccounts(authentication.getName()));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    private ResponseEntity<?> error(RuntimeException e) {
        Map<String, String> body = new HashMap<>();
        body.put("message", e.getMessage());
        return ResponseEntity.badRequest().body(body);
    }
}