package bhookme_backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "reviews")
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_id")
    private Property property;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "car_id")
    private Car car;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "guest_user_id", nullable = false)
    private User guest;

    @Column(nullable = false, columnDefinition = "TINYINT")
    private Integer rating;

    private String title;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column(name = "reviewer_display_name", nullable = false)
    private String reviewerDisplayName;

    @Column(name = "reviewer_avatar_url", length = 500)
    private String reviewerAvatarUrl;

    @Column(name = "is_verified_stay", nullable = false)
    private Boolean isVerifiedStay = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReviewStatus status = ReviewStatus.PENDING;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // The host's public reply, shown under the review on the listing page.
    @Column(name = "host_reply", columnDefinition = "TEXT")
    private String hostReply;

    @Column(name = "host_replied_at")
    private LocalDateTime hostRepliedAt;

    public Review() {}

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Property getProperty() { return property; }
    public void setProperty(Property property) { this.property = property; }

    public Car getCar() { return car; }
    public void setCar(Car car) { this.car = car; }

    public User getGuest() { return guest; }
    public void setGuest(User guest) { this.guest = guest; }

    public Integer getRating() { return rating; }
    public void setRating(Integer rating) { this.rating = rating; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public String getReviewerDisplayName() { return reviewerDisplayName; }
    public void setReviewerDisplayName(String reviewerDisplayName) { this.reviewerDisplayName = reviewerDisplayName; }

    public String getReviewerAvatarUrl() { return reviewerAvatarUrl; }
    public void setReviewerAvatarUrl(String reviewerAvatarUrl) { this.reviewerAvatarUrl = reviewerAvatarUrl; }

    public Boolean getIsVerifiedStay() { return isVerifiedStay; }
    public void setIsVerifiedStay(Boolean isVerifiedStay) { this.isVerifiedStay = isVerifiedStay; }

    public ReviewStatus getStatus() { return status; }
    public void setStatus(ReviewStatus status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public String getHostReply() { return hostReply; }
    public void setHostReply(String hostReply) { this.hostReply = hostReply; }

    public LocalDateTime getHostRepliedAt() { return hostRepliedAt; }
    public void setHostRepliedAt(LocalDateTime hostRepliedAt) { this.hostRepliedAt = hostRepliedAt; }
}