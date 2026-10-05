package bhookme_backend.controller;

import bhookme_backend.dto.AdminUserResponse;
import bhookme_backend.service.AdminUserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @GetMapping
    public ResponseEntity<?> listTenants(Authentication authentication) {
        try {
            List<AdminUserResponse> tenants = adminUserService.getTenants(authentication.getName());
            return ResponseEntity.ok(tenants);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PutMapping("/{id}/toggle-active")
    public ResponseEntity<?> toggleActive(Authentication authentication, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(adminUserService.toggleActive(authentication.getName(), id));
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