package bhookme_backend.dto;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public class ReviewResponse {
    private Long id;
    private Long propertyId;
    private String propertyTitle;
    private Long carId;
    private String carLabel;
    private Integer rating;
    private String title;
    private String comment;
    private String reviewerDisplayName;
    private String reviewerAvatarUrl;
    private Boolean isVerifiedStay;
    private String status;
    private LocalDateTime createdAt;
    private String hostReply;
    private LocalDateTime hostRepliedAt;
    private List<String> imageUrls = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getPropertyId() { return propertyId; }
    public void setPropertyId(Long propertyId) { this.propertyId = propertyId; }

    public String getPropertyTitle() { return propertyTitle; }
    public void setPropertyTitle(String propertyTitle) { this.propertyTitle = propertyTitle; }

    public Long getCarId() { return carId; }
    public void setCarId(Long carId) { this.carId = carId; }

    public String getCarLabel() { return carLabel; }
    public void setCarLabel(String carLabel) { this.carLabel = carLabel; }

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

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public String getHostReply() { return hostReply; }
    public void setHostReply(String hostReply) { this.hostReply = hostReply; }

    public LocalDateTime getHostRepliedAt() { return hostRepliedAt; }
    public void setHostRepliedAt(LocalDateTime hostRepliedAt) { this.hostRepliedAt = hostRepliedAt; }

    public List<String> getImageUrls() { return imageUrls; }
    public void setImageUrls(List<String> imageUrls) { this.imageUrls = imageUrls; }
}