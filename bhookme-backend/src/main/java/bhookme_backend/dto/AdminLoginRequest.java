package bhookme_backend.dto;

// Step 1 of admin/HR login: email + password.
// Step 2: challengeId (from step 1's response) + code (6 digits from the
// authenticator app). Both steps POST to /api/admin-auth/login.
public class AdminLoginRequest {
    private String email;
    private String password;
    private String challengeId;
    private String code;

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getChallengeId() { return challengeId; }
    public void setChallengeId(String challengeId) { this.challengeId = challengeId; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
}