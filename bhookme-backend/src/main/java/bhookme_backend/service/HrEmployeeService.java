package bhookme_backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class HrEmployeeService {

    private final JdbcTemplate jdbc;

    public HrEmployeeService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // Every column except password_hash. Dates are formatted in SQL so the
    // frontend always receives plain "yyyy-MM-dd" strings.
    private static final String EMPLOYEE_SELECT =
        "SELECT id, email, first_name AS firstName, last_name AS lastName, role, " +
        "       is_active AS isActive, " +
        "       DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt, " +
        "       DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s') AS updatedAt, " +
        "       phone, DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dateOfBirth, " +
        "       address, city, state, zip_code AS zipCode, " +
        "       job_title AS jobTitle, department, " +
        "       DATE_FORMAT(hire_date, '%Y-%m-%d') AS hireDate, " +
        "       emergency_contact_name AS emergencyContactName, " +
        "       emergency_contact_phone AS emergencyContactPhone, notes " +
        "FROM admins";

    // JSON field -> admins column. Only these can be edited.
    private static final Map<String, String> TEXT_FIELDS = new LinkedHashMap<>();
    private static final Map<String, String> DATE_FIELDS = new LinkedHashMap<>();
    static {
        TEXT_FIELDS.put("phone", "phone");
        TEXT_FIELDS.put("address", "address");
        TEXT_FIELDS.put("city", "city");
        TEXT_FIELDS.put("state", "state");
        TEXT_FIELDS.put("zipCode", "zip_code");
        TEXT_FIELDS.put("jobTitle", "job_title");
        TEXT_FIELDS.put("department", "department");
        TEXT_FIELDS.put("emergencyContactName", "emergency_contact_name");
        TEXT_FIELDS.put("emergencyContactPhone", "emergency_contact_phone");
        TEXT_FIELDS.put("notes", "notes");
        DATE_FIELDS.put("dateOfBirth", "date_of_birth");
        DATE_FIELDS.put("hireDate", "hire_date");
    }

    // Returns the signed-in HR account's id, or throws if the caller isn't active HR.
    private Long requireHr(String email) {
        List<Long> ids = jdbc.queryForList(
            "SELECT id FROM admins WHERE email = ? AND role = 'HR' AND is_active = 1",
            Long.class, email);
        if (ids.isEmpty()) {
            throw new RuntimeException("Only active HR accounts can manage employees.");
        }
        return ids.get(0);
    }

    private Map<String, Object> getById(Long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(EMPLOYEE_SELECT + " WHERE id = ?", id);
        if (rows.isEmpty()) {
            throw new RuntimeException("Employee not found.");
        }
        return rows.get(0);
    }

    public List<Map<String, Object>> getEmployees(String hrEmail) {
        requireHr(hrEmail);
        return jdbc.queryForList(EMPLOYEE_SELECT + " ORDER BY first_name, last_name");
    }

    public Map<String, Object> getEmployee(String hrEmail, Long id) {
        requireHr(hrEmail);
        return getById(id);
    }

    public Map<String, Object> toggleActive(String hrEmail, Long id) {
        Long selfId = requireHr(hrEmail);
        if (selfId.equals(id)) {
            throw new RuntimeException("You can't disable your own account.");
        }
        int updated = jdbc.update(
            "UPDATE admins SET is_active = NOT is_active, updated_at = NOW() WHERE id = ?", id);
        if (updated == 0) {
            throw new RuntimeException("Employee not found.");
        }
        return getById(id);
    }

    public Map<String, Object> updateEmployee(String hrEmail, Long id, Map<String, Object> body) {
        Long selfId = requireHr(hrEmail);
        getById(id); // 404-style check before editing

        List<String> sets = new ArrayList<>();
        List<Object> args = new ArrayList<>();

        if (body.containsKey("firstName")) {
            String v = clean(body.get("firstName"));
            if (v == null) throw new RuntimeException("First name can't be empty.");
            if (v.length() > 100) throw new RuntimeException("First name is too long.");
            sets.add("first_name = ?");
            args.add(v);
        }
        if (body.containsKey("lastName")) {
            String v = clean(body.get("lastName"));
            if (v == null) throw new RuntimeException("Last name can't be empty.");
            if (v.length() > 100) throw new RuntimeException("Last name is too long.");
            sets.add("last_name = ?");
            args.add(v);
        }
        if (body.containsKey("role")) {
            String v = clean(body.get("role"));
            if (!"ADMIN".equals(v) && !"HR".equals(v)) {
                throw new RuntimeException("Role must be ADMIN or HR.");
            }
            String current = (String) getById(id).get("role");
            if (selfId.equals(id) && !v.equals(current)) {
                throw new RuntimeException("You can't change your own role.");
            }
            sets.add("role = ?");
            args.add(v);
        }
        for (Map.Entry<String, String> f : TEXT_FIELDS.entrySet()) {
            if (body.containsKey(f.getKey())) {
                sets.add(f.getValue() + " = ?");
                args.add(clean(body.get(f.getKey())));
            }
        }
        for (Map.Entry<String, String> f : DATE_FIELDS.entrySet()) {
            if (body.containsKey(f.getKey())) {
                String v = clean(body.get(f.getKey()));
                if (v != null) {
                    try {
                        LocalDate.parse(v);
                    } catch (DateTimeParseException e) {
                        throw new RuntimeException("Dates must look like 2026-10-01.");
                    }
                }
                sets.add(f.getValue() + " = ?");
                args.add(v);
            }
        }

        if (!sets.isEmpty()) {
            sets.add("updated_at = NOW()");
            args.add(id);
            jdbc.update("UPDATE admins SET " + String.join(", ", sets) + " WHERE id = ?", args.toArray());
        }
        return getById(id);
    }

    private String clean(Object value) {
        if (value == null) return null;
        String s = value.toString().trim();
        return s.isEmpty() ? null : s;
    }
}
