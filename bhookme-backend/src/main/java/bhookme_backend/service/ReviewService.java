package bhookme_backend.service;

import bhookme_backend.dto.ReviewCreateRequest;
import bhookme_backend.dto.ReviewResponse;
import bhookme_backend.model.*;
import bhookme_backend.repository.BookingRepository;
import bhookme_backend.repository.CarBookingRepository;
import bhookme_backend.repository.CarRepository;
import bhookme_backend.repository.PropertyRepository;
import bhookme_backend.repository.ReviewRepository;
import bhookme_backend.repository.UserRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class ReviewService {

    private static final int MAX_REPLY_LENGTH = 2000;
    public static final int MAX_PHOTOS_PER_REVIEW = 6;

    private final ReviewRepository reviewRepository;
    private final UserRepository userRepository;
    private final PropertyRepository propertyRepository;
    private final CarRepository carRepository;
    private final BookingRepository bookingRepository;
    private final CarBookingRepository carBookingRepository;
    private final JdbcTemplate jdbc;
    private final R2StorageService r2StorageService;

    public ReviewService(ReviewRepository reviewRepository, UserRepository userRepository,
                          PropertyRepository propertyRepository, CarRepository carRepository,
                          BookingRepository bookingRepository, CarBookingRepository carBookingRepository,
                          JdbcTemplate jdbc, R2StorageService r2StorageService) {
        this.reviewRepository = reviewRepository;
        this.userRepository = userRepository;
        this.propertyRepository = propertyRepository;
        this.carRepository = carRepository;
        this.bookingRepository = bookingRepository;
        this.carBookingRepository = carBookingRepository;
        this.jdbc = jdbc;
        this.r2StorageService = r2StorageService;
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getPropertyReviews(Long propertyId) {
        return reviewRepository.findByProperty_IdAndStatus(propertyId, ReviewStatus.APPROVED).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getCarReviews(Long carId) {
        return reviewRepository.findByCar_IdAndStatus(carId, ReviewStatus.APPROVED).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    // No stay required to review - any logged-in user may review any
    // listing once. isVerifiedStay is auto-detected informational
    // metadata only, same as eStore's isVerifiedPurchase.
    @Transactional
    public ReviewResponse createReview(String reviewerEmail, ReviewCreateRequest request) {
        User guest = findUser(reviewerEmail);

        if (request.getReviewerDisplayName() == null || request.getReviewerDisplayName().trim().isEmpty()) {
            throw new RuntimeException("Please enter your name");
        }
        if (request.getRating() == null || request.getRating() < 1 || request.getRating() > 5) {
            throw new RuntimeException("Rating must be between 1 and 5");
        }
        if (request.getPropertyId() == null && request.getCarId() == null) {
            throw new RuntimeException("A property or car must be specified");
        }
        String avatarUrl = request.getReviewerAvatarUrl();
        if (avatarUrl != null && avatarUrl.isBlank()) avatarUrl = null;
        if (avatarUrl != null && !r2StorageService.isOwnUrl(avatarUrl.trim())) {
            throw new RuntimeException("Your photo must be uploaded through bhookme.");
        }

        Review review = new Review();
        review.setGuest(guest);
        review.setRating(request.getRating());
        review.setTitle(request.getTitle());
        review.setComment(request.getComment());
        review.setReviewerDisplayName(request.getReviewerDisplayName().trim());
        review.setReviewerAvatarUrl(avatarUrl == null ? null : avatarUrl.trim());
        review.setStatus(ReviewStatus.PENDING);

        if (request.getPropertyId() != null) {
            if (reviewRepository.existsByGuest_IdAndProperty_Id(guest.getId(), request.getPropertyId())) {
                throw new RuntimeException("You have already reviewed this property");
            }
            Property property = propertyRepository.findById(request.getPropertyId())
                    .orElseThrow(() -> new RuntimeException("Property not found"));
            review.setProperty(property);
            review.setIsVerifiedStay(hasStayedAtProperty(guest, property));
        } else {
            if (reviewRepository.existsByGuest_IdAndCar_Id(guest.getId(), request.getCarId())) {
                throw new RuntimeException("You have already reviewed this car");
            }
            Car car = carRepository.findById(request.getCarId())
                    .orElseThrow(() -> new RuntimeException("Car not found"));
            review.setCar(car);
            review.setIsVerifiedStay(hasRentedCar(guest, car));
        }

        return toResponse(reviewRepository.save(review));
    }

    private boolean hasStayedAtProperty(User guest, Property property) {
        return bookingRepository.findByGuestId(guest.getId()).stream()
                .anyMatch(b -> b.getProperty().getId().equals(property.getId())
                        && (b.getStatus() == BookingStatus.CONFIRMED || b.getStatus() == BookingStatus.COMPLETED));
    }

    private boolean hasRentedCar(User guest, Car car) {
        return carBookingRepository.findByGuestId(guest.getId()).stream()
                .anyMatch(b -> b.getCar().getId().equals(car.getId())
                        && (b.getStatus() == BookingStatus.CONFIRMED || b.getStatus() == BookingStatus.COMPLETED));
    }

    // Whether this reviewer has already reviewed this property/car -
    // never exposes status/rating/comment back, moderation outcome is
    // never shown to the reviewer, same as eStore.
    @Transactional(readOnly = true)
    public Map<String, Object> getMyReviewStatus(String reviewerEmail, Long propertyId, Long carId) {
        User guest = findUser(reviewerEmail);
        boolean hasReviewed = propertyId != null
                ? reviewRepository.existsByGuest_IdAndProperty_Id(guest.getId(), propertyId)
                : reviewRepository.existsByGuest_IdAndCar_Id(guest.getId(), carId);

        Map<String, Object> result = new HashMap<>();
        result.put("hasReviewed", hasReviewed);
        return result;
    }

    // Every pending review across all of this host's listings (both
    // properties and cars).
    @Transactional(readOnly = true)
    public List<ReviewResponse> getPendingReviewsForHost(String hostEmail) {
        User host = findUser(hostEmail);
        List<ReviewResponse> propertyReviews = reviewRepository.findByProperty_Host_IdAndStatus(host.getId(), ReviewStatus.PENDING).stream()
                .map(this::toResponse).collect(Collectors.toList());
        List<ReviewResponse> carReviews = reviewRepository.findByCar_Host_IdAndStatus(host.getId(), ReviewStatus.PENDING).stream()
                .map(this::toResponse).collect(Collectors.toList());
        propertyReviews.addAll(carReviews);
        return propertyReviews;
    }

    // Every review on this host's houses and cars, in every status, newest
    // first - for the Host Dashboard's Reviews tab.
    @Transactional(readOnly = true)
    public List<ReviewResponse> getAllReviewsForHost(String hostEmail) {
        User host = findUser(hostEmail);
        List<Review> all = new ArrayList<>();
        for (ReviewStatus status : ReviewStatus.values()) {
            all.addAll(reviewRepository.findByProperty_Host_IdAndStatus(host.getId(), status));
            all.addAll(reviewRepository.findByCar_Host_IdAndStatus(host.getId(), status));
        }
        return all.stream()
                .sorted(Comparator.comparing(Review::getCreatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    // Approve/reject. Only the listing's own host, or a bhookme admin
    // (admins table), may moderate - previously anyone logged in could.
    @Transactional
    public ReviewResponse moderate(String callerEmail, Long reviewId, ReviewStatus newStatus) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new RuntimeException("Review not found"));
        if (!isAdmin(callerEmail) && !isListingHost(callerEmail, review)) {
            throw new RuntimeException("You can only moderate reviews on your own listings.");
        }
        review.setStatus(newStatus);
        return toResponse(reviewRepository.save(review));
    }

    // Host's public reply under a review. An empty reply removes it.
    @Transactional
    public ReviewResponse reply(String hostEmail, Long reviewId, String replyText) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new RuntimeException("Review not found"));
        if (!isListingHost(hostEmail, review)) {
            throw new RuntimeException("You can only reply to reviews on your own listings.");
        }

        String text = replyText == null ? "" : replyText.trim();
        if (text.length() > MAX_REPLY_LENGTH) {
            throw new RuntimeException("Replies can be up to " + MAX_REPLY_LENGTH + " characters.");
        }

        if (text.isEmpty()) {
            review.setHostReply(null);
            review.setHostRepliedAt(null);
        } else {
            review.setHostReply(text);
            review.setHostRepliedAt(LocalDateTime.now());
        }
        return toResponse(reviewRepository.save(review));
    }

    // Attaches photos (already uploaded via /api/upload/image) to a review.
    // Only the review's own author can add them, up to MAX_PHOTOS_PER_REVIEW,
    // and only links to bhookme's own R2 bucket are accepted.
    @Transactional
    public ReviewResponse addPhotos(String reviewerEmail, Long reviewId, List<String> urls) {
        User guest = findUser(reviewerEmail);
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new RuntimeException("Review not found"));
        if (!review.getGuest().getId().equals(guest.getId())) {
            throw new RuntimeException("You can only add photos to your own review.");
        }

        List<String> cleaned = new ArrayList<>();
        if (urls != null) {
            for (String u : urls) {
                if (u == null || u.isBlank()) continue;
                String url = u.trim();
                if (!r2StorageService.isOwnUrl(url)) {
                    throw new RuntimeException("Photos must be uploaded through bhookme.");
                }
                if (!cleaned.contains(url)) cleaned.add(url);
            }
        }
        if (cleaned.isEmpty()) {
            return toResponse(review);
        }

        Integer existing = jdbc.queryForObject(
                "SELECT COUNT(*) FROM review_images WHERE review_id = ?", Integer.class, reviewId);
        int start = existing == null ? 0 : existing;
        if (start + cleaned.size() > MAX_PHOTOS_PER_REVIEW) {
            throw new RuntimeException("A review can have up to " + MAX_PHOTOS_PER_REVIEW + " photos.");
        }

        for (int i = 0; i < cleaned.size(); i++) {
            jdbc.update("INSERT INTO review_images (review_id, image_url, display_order) VALUES (?, ?, ?)",
                    reviewId, cleaned.get(i), start + i);
        }
        return toResponse(review);
    }

    private List<String> photosOf(Long reviewId) {
        return jdbc.queryForList(
                "SELECT image_url FROM review_images WHERE review_id = ? ORDER BY display_order, id",
                String.class, reviewId);
    }

    private boolean isListingHost(String email, Review review) {
        Optional<User> user = userRepository.findByEmail(email);
        if (user.isEmpty()) return false;
        Long userId = user.get().getId();
        if (review.getProperty() != null) {
            return review.getProperty().getHost().getId().equals(userId);
        }
        if (review.getCar() != null) {
            return review.getCar().getHost().getId().equals(userId);
        }
        return false;
    }

    private boolean isAdmin(String email) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM admins WHERE email = ? AND is_active = 1", Integer.class, email);
        return count != null && count > 0;
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Account not found"));
    }

    private ReviewResponse toResponse(Review review) {
        ReviewResponse response = new ReviewResponse();
        response.setId(review.getId());
        response.setRating(review.getRating());
        response.setTitle(review.getTitle());
        response.setComment(review.getComment());
        response.setReviewerDisplayName(review.getReviewerDisplayName());
        response.setReviewerAvatarUrl(review.getReviewerAvatarUrl());
        response.setIsVerifiedStay(review.getIsVerifiedStay());
        response.setStatus(review.getStatus().name());
        response.setCreatedAt(review.getCreatedAt());
        response.setHostReply(review.getHostReply());
        response.setHostRepliedAt(review.getHostRepliedAt());
        if (review.getId() != null) response.setImageUrls(photosOf(review.getId()));

        if (review.getProperty() != null) {
            response.setPropertyId(review.getProperty().getId());
            response.setPropertyTitle(review.getProperty().getTitle());
        }
        if (review.getCar() != null) {
            response.setCarId(review.getCar().getId());
            response.setCarLabel(review.getCar().getMake() + " " + review.getCar().getModel());
        }

        return response;
    }
}