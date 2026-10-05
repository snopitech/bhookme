package bhookme_backend.repository;

import bhookme_backend.model.Review;
import bhookme_backend.model.ReviewStatus;
import bhookme_backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    List<Review> findByProperty_IdAndStatus(Long propertyId, ReviewStatus status);
    List<Review> findByCar_IdAndStatus(Long carId, ReviewStatus status);

    boolean existsByGuest_IdAndProperty_Id(Long guestId, Long propertyId);
    boolean existsByGuest_IdAndCar_Id(Long guestId, Long carId);

    // Used by AdminUserService to show a tenant's own review on the
    // Users page, once they've checked out of their latest stay.
    Optional<Review> findByGuest_IdAndProperty_Id(Long guestId, Long propertyId);
    Optional<Review> findByGuest_IdAndCar_Id(Long guestId, Long carId);

    List<Review> findByProperty_Host_IdAndStatus(Long hostId, ReviewStatus status);
    List<Review> findByCar_Host_IdAndStatus(Long hostId, ReviewStatus status);

    List<Review> findByGuest(User guest);
}