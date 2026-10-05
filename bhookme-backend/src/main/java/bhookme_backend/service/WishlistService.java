package bhookme_backend.service;

import bhookme_backend.dto.PropertyResponse;
import bhookme_backend.model.Property;
import bhookme_backend.model.User;
import bhookme_backend.model.Wishlist;
import bhookme_backend.repository.PropertyRepository;
import bhookme_backend.repository.UserRepository;
import bhookme_backend.repository.WishlistRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class WishlistService {

    private final WishlistRepository wishlistRepository;
    private final UserRepository userRepository;
    private final PropertyRepository propertyRepository;
    private final PropertyService propertyService;

    public WishlistService(WishlistRepository wishlistRepository,
                            UserRepository userRepository,
                            PropertyRepository propertyRepository,
                            PropertyService propertyService) {
        this.wishlistRepository = wishlistRepository;
        this.userRepository = userRepository;
        this.propertyRepository = propertyRepository;
        this.propertyService = propertyService;
    }

    @Transactional(readOnly = true)
    public List<Long> getWishlistPropertyIds(String email) {
        User user = findUser(email);
        return wishlistRepository.findByUserId(user.getId()).stream()
                .map(w -> w.getProperty().getId())
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<PropertyResponse> getWishlist(String email) {
        return getWishlistPropertyIds(email).stream()
                .map(propertyService::getPropertyById)
                .collect(Collectors.toList());
    }

    @Transactional
    public void add(String email, Long propertyId) {
        User user = findUser(email);
        Property property = propertyRepository.findById(propertyId)
                .orElseThrow(() -> new RuntimeException("Property not found"));

        // Saving the same listing twice is a no-op, not an error.
        if (wishlistRepository.existsByUserAndProperty(user, property)) {
            return;
        }

        Wishlist wishlist = new Wishlist();
        wishlist.setUser(user);
        wishlist.setProperty(property);
        wishlistRepository.save(wishlist);
    }

    @Transactional
    public void remove(String email, Long propertyId) {
        User user = findUser(email);
        Property property = propertyRepository.findById(propertyId)
                .orElseThrow(() -> new RuntimeException("Property not found"));
        wishlistRepository.deleteByUserAndProperty(user, property);
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Account not found"));
    }
}
