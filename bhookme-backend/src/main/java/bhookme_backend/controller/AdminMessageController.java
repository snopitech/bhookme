package bhookme_backend.controller;

import bhookme_backend.service.AdminMessageService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Admin endpoints for contact form submissions.
 *
 * GET    /api/admin/messages            - list all, newest first
 * GET    /api/admin/messages/count      - total count
 * DELETE /api/admin/messages/{id}       - delete one
 */
@RestController
@RequestMapping("/api/admin/messages")
public class AdminMessageController {

    private final AdminMessageService adminMessageService;

    public AdminMessageController(AdminMessageService adminMessageService) {
        this.adminMessageService = adminMessageService;
    }

    @GetMapping
    public ResponseEntity<?> listMessages(Authentication authentication) {
        try {
            List<Map<String, Object>> messages =
                    adminMessageService.getAllMessages(authentication.getName());
            return ResponseEntity.ok(messages);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/count")
    public ResponseEntity<?> getCount(Authentication authentication) {
        try {
            long count = adminMessageService.getCount(authentication.getName());
            Map<String, Object> body = new HashMap<>();
            body.put("count", count);
            return ResponseEntity.ok(body);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteMessage(Authentication authentication, @PathVariable Long id) {
        try {
            boolean deleted = adminMessageService.deleteMessage(authentication.getName(), id);
            Map<String, String> body = new HashMap<>();
            if (!deleted) {
                body.put("message", "Message not found");
                return ResponseEntity.badRequest().body(body);
            }
            body.put("message", "Message deleted");
            return ResponseEntity.ok(body);
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
