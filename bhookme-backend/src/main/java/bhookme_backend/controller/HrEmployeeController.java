package bhookme_backend.controller;

import bhookme_backend.service.HrEmployeeService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/hr/employees")
public class HrEmployeeController {

    private final HrEmployeeService hrEmployeeService;

    public HrEmployeeController(HrEmployeeService hrEmployeeService) {
        this.hrEmployeeService = hrEmployeeService;
    }

    @GetMapping
    public ResponseEntity<?> list(Authentication authentication) {
        try {
            return ResponseEntity.ok(hrEmployeeService.getEmployees(authentication.getName()));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(Authentication authentication, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(hrEmployeeService.getEmployee(authentication.getName(), id));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(Authentication authentication, @PathVariable Long id,
                                    @RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.ok(hrEmployeeService.updateEmployee(authentication.getName(), id, body));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PutMapping("/{id}/toggle-active")
    public ResponseEntity<?> toggleActive(Authentication authentication, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(hrEmployeeService.toggleActive(authentication.getName(), id));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // Shows the deepest cause (e.g. MySQL's real message) instead of Spring's wrapper.
    private ResponseEntity<?> error(RuntimeException e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        Map<String, String> body = new HashMap<>();
        body.put("message", root.getMessage() != null ? root.getMessage() : e.getMessage());
        return ResponseEntity.badRequest().body(body);
    }
}