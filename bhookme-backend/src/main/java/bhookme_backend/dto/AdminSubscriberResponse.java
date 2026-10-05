package bhookme_backend.dto;

import java.time.LocalDateTime;

/**
 * Admin-facing view of a single newsletter subscriber.
 *
 * Mirrors the columns of the newsletter_subscribers table:
 * email + status (ACTIVE / UNSUBSCRIBED) + the two timestamps.
 */
public class AdminSubscriberResponse {

    private Long id;
    private String email;
    private String status;
    private LocalDateTime subscribedAt;
    private LocalDateTime unsubscribedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getSubscribedAt() { return subscribedAt; }
    public void setSubscribedAt(LocalDateTime subscribedAt) { this.subscribedAt = subscribedAt; }

    public LocalDateTime getUnsubscribedAt() { return unsubscribedAt; }
    public void setUnsubscribedAt(LocalDateTime unsubscribedAt) { this.unsubscribedAt = unsubscribedAt; }
}