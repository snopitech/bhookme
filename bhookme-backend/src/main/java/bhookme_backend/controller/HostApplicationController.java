package bhookme_backend.controller;

import bhookme_backend.dto.HostApplicationRequest;
import bhookme_backend.dto.HostApplicationResponse;
import bhookme_backend.dto.PublicHostApplicationRequest;
import bhookme_backend.service.HostApplicationService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/host-applications")
public class HostApplicationController {

    private final HostApplicationService hostApplicationService;

    public HostApplicationController(HostApplicationService hostApplicationService) {
        this.hostApplicationService = hostApplicationService;
    }

    @GetMapping("/mine")
    public ResponseEntity<?> mine(Authentication authentication) {
        HostApplicationResponse response = hostApplicationService.getMyStatus(authentication.getName());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<?> apply(Authentication authentication, @RequestBody HostApplicationRequest request) {
        try {
            HostApplicationResponse response = hostApplicationService.apply(authentication.getName(), request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Public: for someone with no bhookme account yet. Creates the
    // account and files the application in one step.
    @PostMapping("/public")
    public ResponseEntity<?> applyPublic(@RequestBody PublicHostApplicationRequest request) {
        try {
            HostApplicationResponse response = hostApplicationService.applyPublic(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/admin")
    public ResponseEntity<?> allForAdmin(Authentication authentication) {
        try {
            List<HostApplicationResponse> responses = hostApplicationService.getAllForAdmin(authentication.getName());
            return ResponseEntity.ok(responses);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(Authentication authentication, @PathVariable("id") Long id) {
        try {
            HostApplicationResponse response = hostApplicationService.approve(authentication.getName(), id);
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<?> reject(Authentication authentication, @PathVariable("id") Long id) {
        try {
            HostApplicationResponse response = hostApplicationService.reject(authentication.getName(), id);
            return ResponseEntity.ok(response);
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