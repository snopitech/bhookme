package bhookme_backend.service;

import bhookme_backend.repository.AdminRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * Admin-side read/delete for the contact_messages table.
 *
 * Uses JdbcTemplate (matches how SupportController writes to this
 * table). Every method calls requireAdmin() first, same pattern as
 * the other admin services.
 */
@Service
public class AdminMessageService {

    private final JdbcTemplate jdbc;
    private final AdminRepository adminRepository;

    public AdminMessageService(JdbcTemplate jdbc, AdminRepository adminRepository) {
        this.jdbc = jdbc;
        this.adminRepository = adminRepository;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAllMessages(String adminEmail) {
        requireAdmin(adminEmail);
        return jdbc.queryForList(
                "SELECT id, name, email, topic, message, created_at AS createdAt " +
                "FROM contact_messages ORDER BY created_at DESC, id DESC");
    }

    @Transactional(readOnly = true)
    public long getCount(String adminEmail) {
        requireAdmin(adminEmail);
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM contact_messages", Long.class);
        return count != null ? count : 0L;
    }

    @Transactional
    public boolean deleteMessage(String adminEmail, Long id) {
        requireAdmin(adminEmail);
        int rows = jdbc.update("DELETE FROM contact_messages WHERE id = ?", id);
        return rows > 0;
    }

    private void requireAdmin(String email) {
        if (email == null || !adminRepository.existsByEmail(email)) {
            throw new RuntimeException("Admin access required");
        }
    }
}
