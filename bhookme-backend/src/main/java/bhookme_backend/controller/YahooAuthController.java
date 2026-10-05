package bhookme_backend.controller;

import bhookme_backend.dto.AuthResponse;
import bhookme_backend.service.AuthService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

@RestController
@RequestMapping("/api/auth/yahoo")
public class YahooAuthController {

    private final AuthService authService;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${bhookme.yahoo.client-id}")
    private String yahooClientId;

    @Value("${bhookme.yahoo.client-secret}")
    private String yahooClientSecret;

    @Value("${bhookme.yahoo.redirect-uri}")
    private String yahooRedirectUri;

    public YahooAuthController(AuthService authService) {
        this.authService = authService;
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
    }

    // ============================================================
    // STEP 1 - user clicks "Sign in with Yahoo" in the frontend,
    // which navigates the whole browser to this endpoint.
    // ============================================================
    @GetMapping
    public ResponseEntity<Void> startYahooLogin(
            @RequestParam(value = "returnTo", required = false) String returnTo) {

        String state = returnTo != null ? returnTo : "";

        // .encode() forces UriComponentsBuilder to URL-encode the
        // scope value ("openid email profile" -> "openid%20email%20profile"),
        // otherwise URI.create() rejects the raw spaces.
        @SuppressWarnings("deprecation")
        String authorizeUrl = UriComponentsBuilder
                .fromHttpUrl("https://api.login.yahoo.com/oauth2/request_auth")
                .queryParam("client_id", yahooClientId)
                .queryParam("redirect_uri", yahooRedirectUri)
                .queryParam("response_type", "code")
                .queryParam("scope", "openid email profile")
                .queryParam("state", state)
                .encode()
                .build()
                .toUriString();

        System.out.println("[Yahoo] Redirecting to consent screen: " + authorizeUrl);

        HttpHeaders headers = new HttpHeaders();
        headers.setLocation(URI.create(authorizeUrl));
        return new ResponseEntity<>(headers, HttpStatus.FOUND);
    }

    // ============================================================
    // STEP 4 - Yahoo redirects the user back here with ?code=...
    // ============================================================
    @GetMapping("/callback")
    public ResponseEntity<Void> yahooCallback(
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "state", required = false) String state,
            @RequestParam(value = "error", required = false) String error) {

        String returnTo = (state != null && !state.isBlank()) ? state : "http://localhost:5173";

        if (error != null) {
            System.err.println("[Yahoo] User denied / error: " + error);
            return redirectWithError(returnTo, "yahoo_error=" + error);
        }

        if (code == null || code.isBlank()) {
            System.err.println("[Yahoo] No code in callback");
            return redirectWithError(returnTo, "yahoo_error=no_code");
        }

        try {
            String accessToken = exchangeCodeForToken(code);
            if (accessToken == null) {
                return redirectWithError(returnTo, "yahoo_error=token_exchange_failed");
            }

            Map<String, Object> userInfo = fetchUserInfo(accessToken);
            if (userInfo == null) {
                return redirectWithError(returnTo, "yahoo_error=userinfo_failed");
            }

            String email = String.valueOf(userInfo.get("email"));
            String firstName = userInfo.get("given_name") != null
                    ? String.valueOf(userInfo.get("given_name"))
                    : (userInfo.get("name") != null ? String.valueOf(userInfo.get("name")) : "Yahoo");
            String lastName = userInfo.get("family_name") != null
                    ? String.valueOf(userInfo.get("family_name")) : "User";

            System.out.println("[Yahoo] Got user email: " + email);

            AuthResponse auth = authService.yahooLogin(email, firstName, lastName);

            @SuppressWarnings("deprecation")
            String redirectUrl = UriComponentsBuilder
                    .fromHttpUrl(returnTo)
                    .queryParam("yahoo_token", auth.getToken())
                    .queryParam("yahoo_userId", auth.getUserId())
                    .queryParam("yahoo_email", auth.getEmail())
                    .queryParam("yahoo_firstName", auth.getFirstName())
                    .queryParam("yahoo_lastName", auth.getLastName())
                    .queryParam("yahoo_isHost", auth.getIsHost())
                    .encode()
                    .build()
                    .toUriString();

            System.out.println("[Yahoo] Success, redirecting to frontend: " + redirectUrl);

            HttpHeaders headers = new HttpHeaders();
            headers.setLocation(URI.create(redirectUrl));
            return new ResponseEntity<>(headers, HttpStatus.FOUND);

        } catch (Exception e) {
            System.err.println("[Yahoo] Callback error: " + e.getMessage());
            e.printStackTrace();
            return redirectWithError(returnTo, "yahoo_error=callback_exception");
        }
    }

    // ============================================================
    // HELPERS
    // ============================================================

    @SuppressWarnings("unchecked")
    private String exchangeCodeForToken(String code) {
        try {
            String tokenUrl = "https://api.login.yahoo.com/oauth2/get_token";

            String credentials = yahooClientId + ":" + yahooClientSecret;
            String encoded = Base64.getEncoder()
                    .encodeToString(credentials.getBytes(StandardCharsets.UTF_8));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.set(HttpHeaders.AUTHORIZATION, "Basic " + encoded);

            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("grant_type", "authorization_code");
            body.add("code", code);
            body.add("redirect_uri", yahooRedirectUri);

            ResponseEntity<String> response = restTemplate.postForEntity(
                    tokenUrl,
                    new HttpEntity<>(body, headers),
                    String.class);

            if (response.getBody() == null) {
                System.err.println("[Yahoo] Token endpoint returned empty body");
                return null;
            }

            Map<String, Object> tokenResponse = objectMapper.readValue(
                    response.getBody(),
                    new TypeReference<Map<String, Object>>() {});

            Object accessToken = tokenResponse.get("access_token");
            if (accessToken == null) {
                System.err.println("[Yahoo] No access_token in response: " + response.getBody());
                return null;
            }

            System.out.println("[Yahoo] Got access token");
            return accessToken.toString();

        } catch (Exception e) {
            System.err.println("[Yahoo] exchangeCodeForToken failed: " + e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> fetchUserInfo(String accessToken) {
        try {
            String userinfoUrl = "https://api.login.yahoo.com/openid/v1/userinfo";

            HttpHeaders headers = new HttpHeaders();
            headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);

            ResponseEntity<String> response = restTemplate.exchange(
                    userinfoUrl,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    String.class);

            if (response.getBody() == null) {
                System.err.println("[Yahoo] userinfo returned empty body");
                return null;
            }

            return objectMapper.readValue(
                    response.getBody(),
                    new TypeReference<Map<String, Object>>() {});

        } catch (Exception e) {
            System.err.println("[Yahoo] fetchUserInfo failed: " + e.getMessage());
            return null;
        }
    }

    private ResponseEntity<Void> redirectWithError(String returnTo, String errorQuery) {
        String separator = returnTo.contains("?") ? "&" : "?";
        String url = returnTo + separator + errorQuery;
        HttpHeaders headers = new HttpHeaders();
        headers.setLocation(URI.create(url));
        return new ResponseEntity<>(headers, HttpStatus.FOUND);
    }
}