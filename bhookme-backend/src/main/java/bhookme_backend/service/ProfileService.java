package bhookme_backend.service;

import bhookme_backend.dto.ProfileResponse;
import bhookme_backend.dto.ProfileUpdateRequest;
import bhookme_backend.model.User;
import bhookme_backend.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.Period;

@Service
public class ProfileService {

    private static final int MINIMUM_AGE = 18;

    private final UserRepository userRepository;

    public ProfileService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public ProfileResponse getProfile(String email) {
        return toResponse(findUser(email));
    }

    public ProfileResponse updateProfile(String email, ProfileUpdateRequest request) {
        User user = findUser(email);

        String firstName = clean(request.getFirstName());
        String lastName = clean(request.getLastName());
        String phone = clean(request.getPhone());
        LocalDate dateOfBirth = request.getDateOfBirth();

        if (firstName == null) {
            throw new RuntimeException("First name is required");
        }
        if (lastName == null) {
            throw new RuntimeException("Last name is required");
        }
        if (phone != null && phone.length() > 20) {
            throw new RuntimeException("Phone number is too long");
        }
        if (dateOfBirth == null) {
            throw new RuntimeException("Date of birth is required");
        }
        if (dateOfBirth.isAfter(LocalDate.now())) {
            throw new RuntimeException("Date of birth cannot be in the future");
        }
        if (Period.between(dateOfBirth, LocalDate.now()).getYears() < MINIMUM_AGE) {
            throw new RuntimeException("You must be at least " + MINIMUM_AGE + " years old to book or host");
        }

        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setPhone(phone);
        user.setDateOfBirth(dateOfBirth);

        return toResponse(userRepository.save(user));
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

    private ProfileResponse toResponse(User user) {
        ProfileResponse response = new ProfileResponse();
        response.setId(user.getId());
        response.setEmail(user.getEmail());
        response.setFirstName(user.getFirstName());
        response.setLastName(user.getLastName());
        response.setPhone(user.getPhone());
        response.setDateOfBirth(user.getDateOfBirth());
        response.setIsHost(user.getIsHost());
        response.setIsAdmin(user.getIsAdmin());
        response.setTotpEnabled(user.getTotpEnabled());

        boolean complete = user.getDateOfBirth() != null
                && user.getFirstName() != null && !user.getFirstName().isBlank()
                && user.getLastName() != null && !user.getLastName().isBlank();
        response.setProfileComplete(complete);
        return response;
    }
}