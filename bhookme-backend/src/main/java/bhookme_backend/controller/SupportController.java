package bhookme_backend.controller;

import bhookme_backend.service.EmailService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

// Public footer endpoints (no login needed - opened in SecurityConfig):
//   POST /api/newsletter/subscribe   {"email": "..."}
//   POST /api/contact                {"name","email","topic","message"}
// Both include a hidden "website" field: real people leave it empty,
// spam bots fill it in, and those requests are quietly ignored.
@RestController
@RequestMapping("/api")
public class SupportController {

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");
    private static final Set<String> TOPICS = Set.of(
            "GENERAL", "BOOKING", "PAYMENT", "CANCELLATION", "SAFETY", "HOSTING", "ACCOUNT", "OTHER");

    private final JdbcTemplate jdbc;
    private final EmailService emailService;

    // bhookme's own Gmail (spring.mail.username) receives contact messages.
    @Value("${spring.mail.username}")
    private String supportInbox;

    public SupportController(JdbcTemplate jdbc, EmailService emailService) {
        this.jdbc = jdbc;
        this.emailService = emailService;
    }

    @PostMapping("/newsletter/subscribe")
    public ResponseEntity<?> subscribe(@RequestBody Map<String, String> body) {
        try {
            if (isBot(body)) return ok("You're subscribed!");

            String email = clean(body.get("email"));
            if (email == null || !EMAIL.matcher(email).matches()) {
                return bad("Please enter a valid email address.");
            }
            email = email.toLowerCase();

            List<String> existing = jdbc.queryForList(
                    "SELECT status FROM newsletter_subscribers WHERE email = ?", String.class, email);

            if (!existing.isEmpty() && "ACTIVE".equals(existing.get(0))) {
                return ok("You're already subscribed. Thanks for being with us!");
            }

            if (existing.isEmpty()) {
                jdbc.update("INSERT INTO newsletter_subscribers (email, status) VALUES (?, 'ACTIVE')", email);
            } else {
                jdbc.update("UPDATE newsletter_subscribers SET status = 'ACTIVE', unsubscribed_at = NULL WHERE email = ?", email);
            }

            try {
                emailService.sendSimpleEmail(email, "Welcome to bhookme",
                        "Hi there,\n\n"
                        + "Thanks for subscribing to bhookme! You'll be the first to hear about new homes, "
                        + "cars, experiences and deals.\n\n"
                        + "Don't want these emails? Just reply with \"unsubscribe\" and we'll remove you.\n\n"
                        + "- The bhookme team");
            } catch (Exception e) {
                System.err.println("Newsletter welcome email failed for " + email + ": " + e.getMessage());
            }

            return ok("You're subscribed! Check your inbox for a welcome email.");
        } catch (RuntimeException e) {
            return bad("Could not subscribe right now. Please try again.");
        }
    }

    @PostMapping("/contact")
    public ResponseEntity<?> contact(@RequestBody Map<String, String> body) {
        try {
            if (isBot(body)) return ok("Thanks! Your message was sent.");

            String name = clean(body.get("name"));
            String email = clean(body.get("email"));
            String topic = clean(body.get("topic"));
            String message = clean(body.get("message"));

            if (name == null || name.length() > 150) return bad("Please enter your name.");
            if (email == null || !EMAIL.matcher(email).matches()) return bad("Please enter a valid email address.");
            topic = topic == null ? "GENERAL" : topic.toUpperCase();
            if (!TOPICS.contains(topic)) topic = "OTHER";
            if (message == null || message.length() < 10) return bad("Please write a message (at least 10 characters).");
            if (message.length() > 5000) return bad("Your message is too long (5,000 characters max).");

            jdbc.update("INSERT INTO contact_messages (name, email, topic, message) VALUES (?, ?, ?, ?)",
                    name, email, topic, message);

            // To bhookme's inbox
            try {
                emailService.sendSimpleEmail(supportInbox, "[bhookme contact] " + topic + " - " + name,
                        "New message from the bhookme contact form\n\n"
                        + "Name: " + name + "\n"
                        + "Email: " + email + "\n"
                        + "Topic: " + topic + "\n\n"
                        + message + "\n");
            } catch (Exception e) {
                System.err.println("Contact email to support inbox failed: " + e.getMessage());
            }

            // Confirmation to the visitor
            try {
                emailService.sendSimpleEmail(email, "We got your message",
                        "Hi " + name + ",\n\n"
                        + "Thanks for contacting bhookme. We've received your message and will reply "
                        + "to this email address as soon as we can, usually within 1-2 business days.\n\n"
                        + "Your message:\n\"" + message + "\"\n\n"
                        + "- The bhookme team");
            } catch (Exception e) {
                System.err.println("Contact confirmation email failed for " + email + ": " + e.getMessage());
            }

            return ok("Thanks! Your message was sent. We'll reply by email soon.");
        } catch (RuntimeException e) {
            return bad("Could not send your message right now. Please try again.");
        }
    }

    // Hidden honeypot field: humans never see or fill it.
    private boolean isBot(Map<String, String> body) {
        String trap = body.get("website");
        return trap != null && !trap.isBlank();
    }

    private String clean(String value) {
        if (value == null) return null;
        String s = value.trim();
        return s.isEmpty() ? null : s;
    }

    private ResponseEntity<?> ok(String message) {
        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("message", message);
        return ResponseEntity.ok(res);
    }

    private ResponseEntity<?> bad(String message) {
        Map<String, Object> res = new HashMap<>();
        res.put("success", false);
        res.put("message", message);
        return ResponseEntity.badRequest().body(res);
    }
}