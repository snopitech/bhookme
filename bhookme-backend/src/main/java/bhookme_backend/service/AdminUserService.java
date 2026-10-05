package bhookme_backend.service;

import bhookme_backend.dto.AdminUserResponse;
import bhookme_backend.model.Booking;
import bhookme_backend.model.Review;
import bhookme_backend.model.User;
import bhookme_backend.repository.AdminRepository;
import bhookme_backend.repository.BookingRepository;
import bhookme_backend.repository.ReviewRepository;
import bhookme_backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class AdminUserService {

    private final UserRepository userRepository;
    private final BookingRepository bookingRepository;
    private final ReviewRepository reviewRepository;
    private final AdminRepository adminRepository;

    public AdminUserService(UserRepository userRepository, BookingRepository bookingRepository,
                             ReviewRepository reviewRepository, AdminRepository adminRepository) {
        this.userRepository = userRepository;
        this.bookingRepository = bookingRepository;
        this.reviewRepository = reviewRepository;
        this.adminRepository = adminRepository;
    }

    // Every tenant (non-host) account, with their current/most recent
    // host and, once checked out, their own review for that stay.
    @Transactional(readOnly = true)
    public List<AdminUserResponse> getTenants(String adminEmail) {
        requireAdmin(adminEmail);

        return userRepository.findAll().stream()
                .filter(u -> !Boolean.TRUE.equals(u.getIsHost()))
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public AdminUserResponse toggleActive(String adminEmail, Long userId) {
        requireAdmin(adminEmail);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        user.setIsActive(!Boolean.TRUE.equals(user.getIsActive()));
        return toResponse(userRepository.save(user));
    }

    private AdminUserResponse toResponse(User user) {
        AdminUserResponse response = new AdminUserResponse();
        response.setId(user.getId());
        response.setFirstName(user.getFirstName());
        response.setLastName(user.getLastName());
        response.setEmail(user.getEmail());
        response.setPhone(user.getPhone());
        response.setIsActive(user.getIsActive());
        response.setHasCheckedOut(false);

        List<Booking> bookings = bookingRepository.findByGuestId(user.getId());
        Booking latest = bookings.stream()
                .max(Comparator.comparing(Booking::getCreatedAt))
                .orElse(null);

        if (latest != null) {
            User host = latest.getProperty().getHost();
            response.setHostName(host.getFirstName() + " " + host.getLastName());

            boolean checkedOut = latest.getCheckOutDate().isBefore(LocalDate.now());
            response.setHasCheckedOut(checkedOut);

            if (checkedOut) {
                Optional<Review> review = reviewRepository.findByGuest_IdAndProperty_Id(
                        user.getId(), latest.getProperty().getId());
                review.ifPresent(r -> {
                    response.setReviewRating(r.getRating());
                    response.setReviewComment(r.getComment());
                });
            }
        }

        return response;
    }

    private void requireAdmin(String email) {
        if (!adminRepository.existsByEmail(email)) {
            throw new RuntimeException("Admin access required");
        }
    }
}