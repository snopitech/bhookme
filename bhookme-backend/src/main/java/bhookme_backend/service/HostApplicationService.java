package bhookme_backend.service;

import bhookme_backend.dto.HostApplicationRequest;
import bhookme_backend.dto.HostApplicationResponse;
import bhookme_backend.dto.PublicHostApplicationRequest;
import bhookme_backend.model.ApplicationStatus;
import bhookme_backend.model.HostApplication;
import bhookme_backend.model.User;
import bhookme_backend.repository.AdminRepository;
import bhookme_backend.repository.HostApplicationRepository;
import bhookme_backend.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class HostApplicationService {

    private final HostApplicationRepository applicationRepository;
    private final UserRepository userRepository;
    private final EmailService emailService;
    private final PasswordEncoder passwordEncoder;
    private final AdminRepository adminRepository;

    public HostApplicationService(HostApplicationRepository applicationRepository,
                                   UserRepository userRepository,
                                   EmailService emailService,
                                   PasswordEncoder passwordEncoder,
                                   AdminRepository adminRepository) {
        this.applicationRepository = applicationRepository;
        this.userRepository = userRepository;
        this.emailService = emailService;
        this.passwordEncoder = passwordEncoder;
        this.adminRepository = adminRepository;
    }

    @Transactional(readOnly = true)
    public HostApplicationResponse getMyStatus(String email) {
        User user = findUser(email);
        return applicationRepository.findTopByUser_IdOrderByCreatedAtDesc(user.getId())
                .map(this::toResponse)
                .orElse(null);
    }

    @Transactional
    public HostApplicationResponse apply(String email, HostApplicationRequest request) {
        User user = findUser(email);

        if (Boolean.TRUE.equals(user.getIsHost())) {
            throw new RuntimeException("You are already a host");
        }

        Optional<HostApplication> existing = applicationRepository.findTopByUser_IdOrderByCreatedAtDesc(user.getId());
        if (existing.isPresent() && existing.get().getStatus() == ApplicationStatus.PENDING) {
            throw new RuntimeException("You already have an application under review");
        }

        HostApplication application = new HostApplication();
        application.setUser(user);
        application.setMessage(request.getMessage());
        application.setStatus(ApplicationStatus.PENDING);

        return toResponse(applicationRepository.save(application));
    }

    // For someone with no bhookme account at all: creates the account
    // (with the password they chose here) and files the application in
    // one step. If the email already exists, we do NOT touch that
    // account's password - they're told to log in and apply from there.
    @Transactional
    public HostApplicationResponse applyPublic(PublicHostApplicationRequest request) {
        String email = clean(request.getEmail());
        String firstName = clean(request.getFirstName());
        String lastName = clean(request.getLastName());
        String password = request.getPassword();

        if (email == null) {
            throw new RuntimeException("Email is required");
        }
        if (firstName == null) {
            throw new RuntimeException("First name is required");
        }
        if (lastName == null) {
            throw new RuntimeException("Last name is required");
        }
        if (password == null || password.length() < 6) {
            throw new RuntimeException("Password must be at least 6 characters");
        }
        if (userRepository.existsByEmail(email)) {
            throw new RuntimeException("An account with this email already exists. Please log in and apply from your account.");
        }

        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setIsHost(false);
        user.setIsActive(true);
        User savedUser = userRepository.save(user);

        try {
            emailService.sendWelcomeEmail(savedUser.getEmail(), savedUser.getFirstName());
        } catch (Exception e) {
            System.err.println("Failed to send welcome email to " + savedUser.getEmail() + ": " + e.getMessage());
        }

        HostApplication application = new HostApplication();
        application.setUser(savedUser);
        application.setMessage(request.getMessage());
        application.setStatus(ApplicationStatus.PENDING);

        return toResponse(applicationRepository.save(application));
    }

    @Transactional(readOnly = true)
    public List<HostApplicationResponse> getAllForAdmin(String adminEmail) {
        requireAdmin(adminEmail);
        return applicationRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public HostApplicationResponse approve(String adminEmail, Long applicationId) {
        requireAdmin(adminEmail);
        HostApplication application = findApplication(applicationId);

        if (application.getStatus() != ApplicationStatus.PENDING) {
            throw new RuntimeException("This application has already been reviewed");
        }

        application.setStatus(ApplicationStatus.APPROVED);
        application.setReviewedBy(null);
        application.setReviewedAt(LocalDateTime.now());
        applicationRepository.save(application);

        User applicant = application.getUser();
        applicant.setIsHost(true);
        userRepository.save(applicant);

        try {
            emailService.sendSimpleEmail(
                    applicant.getEmail(),
                    "You're approved to host on bhookme!",
                    "Hi " + applicant.getFirstName() + ",\n\n"
                            + "Your host application has been approved. Log back in and go to Become a Host to finish setting up two-factor login and start listing.\n\n"
                            + "- The bhookme team"
            );
        } catch (Exception e) {
            System.err.println("Failed to send host-approval email to " + applicant.getEmail() + ": " + e.getMessage());
        }

        return toResponse(application);
    }

    @Transactional
    public HostApplicationResponse reject(String adminEmail, Long applicationId) {
        requireAdmin(adminEmail);
        HostApplication application = findApplication(applicationId);

        if (application.getStatus() != ApplicationStatus.PENDING) {
            throw new RuntimeException("This application has already been reviewed");
        }

        application.setStatus(ApplicationStatus.REJECTED);
        application.setReviewedBy(null);
        application.setReviewedAt(LocalDateTime.now());
        applicationRepository.save(application);

        User applicant = application.getUser();
        try {
            emailService.sendSimpleEmail(
                    applicant.getEmail(),
                    "Update on your bhookme host application",
                    "Hi " + applicant.getFirstName() + ",\n\n"
                            + "Thanks for your interest in hosting on bhookme. We're not able to approve your application at this time.\n\n"
                            + "- The bhookme team"
            );
        } catch (Exception e) {
            System.err.println("Failed to send host-rejection email to " + applicant.getEmail() + ": " + e.getMessage());
        }

        return toResponse(application);
    }

    // Admin status now lives entirely in the separate `admins` table,
    // not on User - this just checks that table for the caller's email.
    private void requireAdmin(String email) {
        if (!adminRepository.existsByEmail(email)) {
            throw new RuntimeException("Admin access required");
        }
    }

    private HostApplication findApplication(Long id) {
        return applicationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Application not found"));
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Account not found"));
    }

    private String clean(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private HostApplicationResponse toResponse(HostApplication application) {
        User applicant = application.getUser();

        HostApplicationResponse response = new HostApplicationResponse();
        response.setId(application.getId());
        response.setUserId(applicant.getId());
        response.setApplicantFirstName(applicant.getFirstName());
        response.setApplicantLastName(applicant.getLastName());
        response.setApplicantEmail(applicant.getEmail());
        response.setMessage(application.getMessage());
        response.setStatus(application.getStatus().name());
        response.setCreatedAt(application.getCreatedAt());
        response.setReviewedAt(application.getReviewedAt());
        return response;
    }
}