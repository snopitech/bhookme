package bhookme_backend.controller;

import bhookme_backend.service.LeaseService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;

// ============================================================
// Monthly stays & leases
// ------------------------------------------------------------
// Lease listings:
//   GET    /api/leases                 public - active listings
//   GET    /api/leases/{id}            public - one listing
//   GET    /api/leases/mine            host   - own listings
//   POST   /api/leases                 host   - create
//   PUT    /api/leases/{id}            host   - edit
//   PUT    /api/leases/{id}/status     host   - {"status":"ACTIVE"|"INACTIVE"}
//   DELETE /api/leases/{id}            host   - delete
//   POST   /api/leases/{id}/apply      tenant - submit application
//
// Applications:
//   GET  /api/lease-applications/mine          tenant - own applications
//   GET  /api/lease-applications/host          host   - applications to review
//   PUT  /api/lease-applications/{id}/decision host   - {"decision":"APPROVED"|"DECLINED","note":"..."}
//   PUT  /api/lease-applications/{id}/paid     host   - {"paid":true|false}
//   POST /api/lease-applications/{id}/cancel   tenant - withdraw
//   PUT  /api/lease-applications/{id}/confirm  host   - {"confirmed":true|false}
//   GET  /api/lease-applications/{id}/messages tenant or host - conversation
//   POST /api/lease-applications/{id}/messages tenant or host - {"content":"..."}
//
// Documents:
//   GET  /api/lease-documents                  confirmed lease agreements
//                                              {asTenant:[...], asHost:[...]}
// ============================================================
@RestController
public class LeaseController {

    private final LeaseService leaseService;

    public LeaseController(LeaseService leaseService) {
        this.leaseService = leaseService;
    }

    // ---------- listings ----------

    @GetMapping("/api/leases")
    public ResponseEntity<?> all() {
        return run(leaseService::getActiveLeases);
    }

    @GetMapping("/api/leases/mine")
    public ResponseEntity<?> mine(Authentication auth) {
        return run(() -> leaseService.getMyLeases(email(auth)));
    }

    @GetMapping("/api/leases/{id}")
    public ResponseEntity<?> one(@PathVariable("id") Long id) {
        return run(() -> leaseService.getLease(id));
    }

    @PostMapping("/api/leases")
    public ResponseEntity<?> create(Authentication auth, @RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(leaseService.createLease(email(auth), body));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PutMapping("/api/leases/{id}")
    public ResponseEntity<?> update(Authentication auth, @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        return run(() -> leaseService.updateLease(email(auth), id, body));
    }

    @PutMapping("/api/leases/{id}/status")
    public ResponseEntity<?> status(Authentication auth, @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        return run(() -> leaseService.setLeaseStatus(email(auth), id, String.valueOf(body.get("status"))));
    }

    @DeleteMapping("/api/leases/{id}")
    public ResponseEntity<?> delete(Authentication auth, @PathVariable("id") Long id) {
        return run(() -> leaseService.deleteLease(email(auth), id));
    }

    @PostMapping("/api/leases/{id}/apply")
    public ResponseEntity<?> apply(Authentication auth, @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(leaseService.apply(email(auth), id, body));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    // ---------- applications ----------

    @GetMapping("/api/lease-applications/mine")
    public ResponseEntity<?> myApplications(Authentication auth) {
        return run(() -> leaseService.getMyApplications(email(auth)));
    }

    @GetMapping("/api/lease-applications/host")
    public ResponseEntity<?> hostApplications(Authentication auth) {
        return run(() -> leaseService.getHostApplications(email(auth)));
    }

    @PutMapping("/api/lease-applications/{id}/decision")
    public ResponseEntity<?> decide(Authentication auth, @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        return run(() -> leaseService.decide(email(auth), id,
                String.valueOf(body.get("decision")),
                body.get("note") == null ? null : String.valueOf(body.get("note"))));
    }

    @PutMapping("/api/lease-applications/{id}/paid")
    public ResponseEntity<?> paid(Authentication auth, @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        boolean paid = Boolean.TRUE.equals(body.get("paid")) || "true".equalsIgnoreCase(String.valueOf(body.get("paid")));
        return run(() -> leaseService.setPaid(email(auth), id, paid));
    }

    @PostMapping("/api/lease-applications/{id}/cancel")
    public ResponseEntity<?> cancel(Authentication auth, @PathVariable("id") Long id) {
        return run(() -> leaseService.cancel(email(auth), id));
    }

    @PutMapping("/api/lease-applications/{id}/confirm")
    public ResponseEntity<?> confirm(Authentication auth, @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        boolean confirmed = Boolean.TRUE.equals(body.get("confirmed"))
                || "true".equalsIgnoreCase(String.valueOf(body.get("confirmed")));
        return run(() -> leaseService.setConfirmed(email(auth), id, confirmed));
    }

    @GetMapping("/api/lease-applications/{id}/messages")
    public ResponseEntity<?> messages(Authentication auth, @PathVariable("id") Long id) {
        return run(() -> leaseService.getMessages(email(auth), id));
    }

    @PostMapping("/api/lease-applications/{id}/messages")
    public ResponseEntity<?> sendMessage(Authentication auth, @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        return run(() -> leaseService.sendMessage(email(auth), id,
                body.get("content") == null ? null : String.valueOf(body.get("content"))));
    }

    // ---------- documents ----------

    @GetMapping("/api/lease-documents")
    public ResponseEntity<?> documents(Authentication auth) {
        return run(() -> leaseService.getDocuments(email(auth)));
    }

    // ---------- helpers ----------

    private String email(Authentication auth) {
        if (auth == null) throw new RuntimeException("Please log in.");
        return auth.getName();
    }

    private ResponseEntity<?> run(Supplier<Object> action) {
        try {
            return ResponseEntity.ok(action.get());
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    private ResponseEntity<?> error(RuntimeException e) {
        Map<String, String> body = new HashMap<>();
        body.put("message", e.getMessage() == null ? "Something went wrong." : e.getMessage());
        return ResponseEntity.badRequest().body(body);
    }
}