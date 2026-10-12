package bhookme_backend.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(Customizer.withDefaults())
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                // Must come before the blanket /api/auth/** permitAll below -
                // Spring Security matches rules in order, so this narrower,
                // authenticated-only rule has to be listed first or the
                // broader permitAll would win and let anyone call it with
                // no login at all.
                .requestMatchers(HttpMethod.PUT, "/api/auth/set-password").authenticated()
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/admin-auth/login").permitAll()
                // Must be permitAll here too, even though it's not truly
                // public - the real access control (bootstrap mode vs
                // HR-only) is enforced inside AdminAuthService.createAdmin
                // itself, since Spring Security has no way to express
                // "public only if a table is empty." If this stayed
                // authenticated() here, an unauthenticated bootstrap
                // request would be rejected with a bare 403 before ever
                // reaching that service-layer check.
                .requestMatchers(HttpMethod.POST, "/api/admin-auth/create").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/properties/mine").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/properties/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/bookings/quote").permitAll()
                // A host's own cars need login (listed first so the public rule below doesn't swallow it).
                .requestMatchers(HttpMethod.GET, "/api/cars/mine").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/cars/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/car-bookings/quote").permitAll()
                // Experiences: a host's own list needs login (listed first so the
                // public rule below doesn't swallow it); browsing and detail pages
                // are open to everyone. Creating/editing still requires login via
                // anyRequest().authenticated() at the bottom.
                .requestMatchers(HttpMethod.GET, "/api/experiences/mine").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/experiences", "/api/experiences/**").permitAll()
                // Monthly stays & leases: a host's own list needs login (listed
                // first so the public rule below doesn't swallow it); browsing a
                // listing is open to everyone. Applying, approving, etc. need
                // login via anyRequest().authenticated() at the bottom.
                .requestMatchers(HttpMethod.GET, "/api/leases/mine").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/leases", "/api/leases/*").permitAll()
                // Footer: newsletter signup and contact form are open to everyone.
                .requestMatchers(HttpMethod.POST, "/api/newsletter/subscribe", "/api/contact").permitAll()
                // Anyone with no account yet can apply to become a host.
                .requestMatchers(HttpMethod.POST, "/api/host-applications/public").permitAll()
                // Anyone can read a listing's approved reviews before logging in.
                .requestMatchers(HttpMethod.GET, "/api/reviews/property/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/reviews/car/**").permitAll()
                // Approved reviews on a lease page are public too.
                .requestMatchers(HttpMethod.GET, "/api/lease-reviews/lease/**").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}