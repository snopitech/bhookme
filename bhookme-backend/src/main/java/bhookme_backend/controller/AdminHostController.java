package bhookme_backend.controller;

import bhookme_backend.service.AdminHostService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminHostController {

    private final AdminHostService adminHostService;

    public AdminHostController(AdminHostService adminHostService) {
        this.adminHostService = adminHostService;
    }

    @GetMapping("/hosts")
    public ResponseEntity<?> listHosts(Authentication authentication) {
        try {
            return ResponseEntity.ok(adminHostService.getHosts(authentication.getName()));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PutMapping("/hosts/{id}/toggle-active")
    public ResponseEntity<?> toggleActive(Authentication authentication, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(adminHostService.toggleActive(authentication.getName(), id));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/hosts/{id}/listings")
    public ResponseEntity<?> hostListings(Authentication authentication, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(adminHostService.getHostListings(authentication.getName(), id));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/listings/houses")
    public ResponseEntity<?> allHouses(Authentication authentication) {
        try {
            return ResponseEntity.ok(adminHostService.getAllHouses(authentication.getName()));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/listings/cars")
    public ResponseEntity<?> allCars(Authentication authentication) {
        try {
            return ResponseEntity.ok(adminHostService.getAllCars(authentication.getName()));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // What deleting this listing will also remove (bookings, reviews, messages).
    //   type = houses | cars
    @GetMapping("/listings/{type}/{id}/delete-preview")
    public ResponseEntity<?> deletePreview(Authentication authentication,
                                           @PathVariable String type, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(adminHostService.deletePreview(authentication.getName(), type, id));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Permanently delete a listing, even with booking history (admins only).
    @DeleteMapping("/listings/{type}/{id}")
    public ResponseEntity<?> deleteListing(Authentication authentication,
                                           @PathVariable String type, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(adminHostService.deleteListing(authentication.getName(), type, id));
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