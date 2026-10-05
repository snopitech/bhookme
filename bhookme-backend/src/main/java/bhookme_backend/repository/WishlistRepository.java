package bhookme_backend.repository;

import bhookme_backend.model.User;
import bhookme_backend.model.Property;
import bhookme_backend.model.Wishlist;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface WishlistRepository extends JpaRepository<Wishlist, Long> {

    List<Wishlist> findByUserId(Long userId);

    Optional<Wishlist> findByUserAndProperty(User user, Property property);

    void deleteByUserAndProperty(User user, Property property);

    boolean existsByUserAndProperty(User user, Property property);
}
