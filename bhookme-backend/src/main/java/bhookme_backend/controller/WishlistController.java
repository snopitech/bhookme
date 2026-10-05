package bhookme_backend.controller;

import bhookme_backend.dto.PropertyResponse;
import bhookme_backend.service.WishlistService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/wishlist")
public class WishlistController {

    private final WishlistService wishlistService;

    public WishlistController(WishlistService wishlistService) {
        this.wishlistService = wishlistService;
    }

    @GetMapping
    public ResponseEntity<List<PropertyResponse>> getWishlist(Authentication authentication) {
        return ResponseEntity.ok(wishlistService.getWishlist(authentication.getName()));
    }

    @GetMapping("/ids")
    public ResponseEntity<List<Long>> getWishlistIds(Authentication authentication) {
        return ResponseEntity.ok(wishlistService.getWishlistPropertyIds(authentication.getName()));
    }

    @PostMapping("/{propertyId}")
    public ResponseEntity<?> add(Authentication authentication, @PathVariable Long propertyId) {
        try {
            wishlistService.add(authentication.getName(), propertyId);
            return ResponseEntity.ok().build();
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @DeleteMapping("/{propertyId}")
    public ResponseEntity<?> remove(Authentication authentication, @PathVariable Long propertyId) {
        try {
            wishlistService.remove(authentication.getName(), propertyId);
            return ResponseEntity.ok().build();
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
