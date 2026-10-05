
package bhookme_backend.controller;

import bhookme_backend.dto.ProfileResponse;
import bhookme_backend.dto.ProfileUpdateRequest;
import bhookme_backend.service.ProfileService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public ResponseEntity<?> getProfile(Authentication authentication) {
        try {
            ProfileResponse response = profileService.getProfile(authentication.getName());
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PutMapping
    public ResponseEntity<?> updateProfile(Authentication authentication,
                                            @RequestBody ProfileUpdateRequest request) {
        try {
            ProfileResponse response = profileService.updateProfile(authentication.getName(), request);
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