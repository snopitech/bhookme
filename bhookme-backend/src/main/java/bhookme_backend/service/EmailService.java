package bhookme_backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Service
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String fromAddress;

    private static final DateTimeFormatter DATE_FMT =
            DateTimeFormatter.ofPattern("MMM d, yyyy");

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public void sendSimpleEmail(String to, String subject, String body) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(body);
        mailSender.send(message);
    }

    public void sendWelcomeEmail(String to, String firstName) {
        String subject = "Welcome to bhookme, " + firstName + "!";
        String body = "Hi " + firstName + ",\n\n"
                + "Thanks for joining bhookme. You're all set to start browsing and booking stays.\n\n"
                + "- The bhookme team";
        sendSimpleEmail(to, subject, body);
    }

    /**
     * Host password reset email.
     *
     * The resetUrl is a full https://bhookme.com/host-reset-password?token=...
     * link that the user clicks to set a new password. Link expires
     * after 24 hours (enforced backend-side, see PasswordResetToken).
     */
    public void sendHostPasswordResetEmail(String to, String firstName, String resetUrl) {
        String subject = "Reset your bhookme host password";
        String body = "Hi " + (firstName != null && !firstName.isBlank() ? firstName : "there") + ",\n\n"
                + "We received a request to reset the password for your bhookme host account.\n\n"
                + "To set a new password, click this link:\n\n"
                + resetUrl + "\n\n"
                + "This link will expire in 24 hours. If you didn't request a password reset, "
                + "you can safely ignore this email - your password won't be changed.\n\n"
                + "- The bhookme team";
        sendSimpleEmail(to, subject, body);
    }

    // ============================================================
    // Booking notifications to the guest
    // ------------------------------------------------------------
    // These fire when the host takes an action on a booking. Until
    // Stripe is wired up, the host triggers Paid and Confirmed
    // manually; the emails are the same ones Stripe will eventually
    // trigger from its webhook.
    // ============================================================

    /**
     * Sent when the host marks a booking as paid. This is a courtesy
     * notice; it does not yet mean funds moved (Stripe integration is
     * pending). The next email the guest should receive is Confirmed.
     */
    public void sendBookingPaidEmail(String to, String guestFirstName,
                                      String propertyTitle,
                                      LocalDate checkIn, LocalDate checkOut,
                                      BigDecimal totalPrice) {
        String subject = "Payment recorded for your bhookme booking";
        String body = "Hi " + safeName(guestFirstName) + ",\n\n"
                + "Your host has recorded your payment for:\n\n"
                + "  " + propertyTitle + "\n"
                + "  " + formatRange(checkIn, checkOut) + "\n"
                + "  Total: " + formatMoney(totalPrice) + "\n\n"
                + "This is the first step - the host will confirm your booking next. "
                + "You'll get another email when it's confirmed.\n\n"
                + "- The bhookme team";
        sendSimpleEmail(to, subject, body);
    }

    /**
     * Sent when the host confirms a paid booking. From this moment the
     * dates are locked and other guests can no longer book them.
     */
    public void sendBookingConfirmedEmail(String to, String guestFirstName,
                                           String propertyTitle,
                                           LocalDate checkIn, LocalDate checkOut,
                                           BigDecimal totalPrice) {
        String subject = "Your bhookme booking is confirmed";
        String body = "Hi " + safeName(guestFirstName) + ",\n\n"
                + "Good news - your host has confirmed your booking.\n\n"
                + "  " + propertyTitle + "\n"
                + "  " + formatRange(checkIn, checkOut) + "\n"
                + "  Total: " + formatMoney(totalPrice) + "\n\n"
                + "The dates are now locked in. You can view or manage this booking from your trips page.\n\n"
                + "- The bhookme team";
        sendSimpleEmail(to, subject, body);
    }

    /**
     * Sent when the host declines a booking. If the guest had already
     * been marked as paid, the email states that a refund is being
     * arranged - even though Stripe isn't live yet, the host telling
     * us "paid" means real money may have changed hands and the guest
     * needs a clear answer.
     *
     * `reason` is a short host-selected phrase (e.g. "Dates already
     * taken", "Listing unavailable") that goes into the email body.
     */
    public void sendBookingDeclinedEmail(String to, String guestFirstName,
                                          String propertyTitle,
                                          LocalDate checkIn, LocalDate checkOut,
                                          BigDecimal totalPrice,
                                          boolean wasPaid,
                                          String reason) {
        String subject = "Your bhookme booking was declined";
        StringBuilder body = new StringBuilder();
        body.append("Hi ").append(safeName(guestFirstName)).append(",\n\n")
            .append("Unfortunately your host can't accept this booking:\n\n")
            .append("  ").append(propertyTitle).append("\n")
            .append("  ").append(formatRange(checkIn, checkOut)).append("\n")
            .append("  Total: ").append(formatMoney(totalPrice)).append("\n\n");

        if (reason != null && !reason.isBlank()) {
            body.append("Reason from the host:\n")
                .append("  \"").append(reason.trim()).append("\"\n\n");
        }

        if (wasPaid) {
            body.append("Because you were already marked as paid, a refund is being arranged. ")
                .append("If you don't see it within a few business days, reply to this email and we'll look into it.\n\n");
        } else {
            body.append("No payment was captured for this booking, so there's nothing to refund.\n\n");
        }

        body.append("You can browse other listings and book again any time.\n\n")
            .append("- The bhookme team");

        sendSimpleEmail(to, subject, body.toString());
    }

    // ------------------------------------------------------------
    // Small formatting helpers - keep emails consistent.
    // ------------------------------------------------------------

    private String safeName(String firstName) {
        return firstName != null && !firstName.isBlank() ? firstName : "there";
    }

    private String formatRange(LocalDate checkIn, LocalDate checkOut) {
        if (checkIn == null || checkOut == null) return "";
        return DATE_FMT.format(checkIn) + " - " + DATE_FMT.format(checkOut);
    }

    private String formatMoney(BigDecimal amount) {
        if (amount == null) return "$0.00";
        return "$" + amount.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }
}