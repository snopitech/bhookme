package bhookme_backend.dto;

public class ReviewCreateRequest {
    private Long propertyId;
    private Long carId;
    private Integer rating;
    private String title;
    private String comment;
    private String reviewerDisplayName;
    private String reviewerAvatarUrl;

    public Long getPropertyId() { return propertyId; }
    public void setPropertyId(Long propertyId) { this.propertyId = propertyId; }

    public Long getCarId() { return carId; }
    public void setCarId(Long carId) { this.carId = carId; }

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
}