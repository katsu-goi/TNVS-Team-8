package com.photonicomega.facilities.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;
    private final UserDetailsService userDetailsService;
    private final JwtAuthenticationEntryPoint authEntryPoint;

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    @Value("${app.security.bcrypt-strength:12}")
    private int bcryptStrength;

    private static final String[] PUBLIC_ENDPOINTS = {
            "/v1/auth/login",
            "/v1/auth/refresh",
            "/v1/auth/forgot-password",
            "/v1/auth/reset-password",
            "/v1/auth/hr/assistance",
            "/v3/api-docs/**",
            "/swagger-ui/**",
            "/swagger-ui.html",
            "/actuator/health",
            "/actuator/info",
            "/files/**",
            "/ws-endpoint/**",
            // Container error dispatch must not be re-secured: AccessDeniedHandler
            // sends a 403 via sendError(), which forwards to /error. If /error is
            // still behind authentication, that anonymous dispatch overwrites the
            // 403 with a 401 before the error controller can render it.
            "/error"
    };

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session ->
                    session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(ex -> ex
                    .authenticationEntryPoint(authEntryPoint))
            .authorizeHttpRequests(auth -> auth
                    .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                    .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
                    .requestMatchers("/v1/admin/**").hasRole("SUPER_ADMIN")
                    .requestMatchers("/v1/security/**").hasRole("SUPER_ADMIN")
                    .requestMatchers("/v1/facilities-manager/**").hasRole("FACILITIES_MANAGER")
                    .requestMatchers("/v1/facilities-officer/**").hasRole("FACILITIES_OFFICER")
                    // The records family. COMPLIANCE_OFFICER raises a disposal;
                    // COMPLIANCE_MANAGER / DATA_PROTECTION_OFFICER / LEGAL_COUNSEL
                    // are the roles with the authority to sign one off. With only
                    // COMPLIANCE_OFFICER admitted here, the two-person rule on
                    // disposal was unsatisfiable: the sole role that could reach
                    // the decide endpoint was the same role that raised the
                    // request, so enforcement would have deadlocked every disposal
                    // rather than getting a second pair of eyes on it.
                    //
                    // SUPER_ADMIN and SYSTEM_ADMINISTRATOR are deliberately absent.
                    // Administering the platform must not confer access to the
                    // company's records, and this is the URL layer where that
                    // would otherwise leak in.
                    .requestMatchers("/v1/compliance/**").hasAnyRole(
                            "COMPLIANCE_OFFICER", "COMPLIANCE_MANAGER",
                            "RECORDS_OFFICER", "DATA_PROTECTION_OFFICER", "LEGAL_COUNSEL")
                    .requestMatchers("/v1/legal/**").hasAnyRole("LEGAL_OFFICER", "LEGAL_COUNSEL")
                    .requestMatchers("/v1/procurement/**").hasRole("CONTRACT_OFFICER")
                    .requestMatchers("/v1/employee/**").hasRole("EMPLOYEE")
                    // The approval gate is reachable by any authenticated user by
                    // design: it is a shared inbox spanning every module, so a URL
                    // rule cannot express who may act on a given request. Authority
                    // is decided per request inside ApprovalGateService against
                    // SensitiveAction, which is strictly narrower than any prefix
                    // rule could be - the queue endpoint returns only the requests
                    // the caller is actually eligible to decide, and a vote from an
                    // unauthorised role is refused with its reason.
                    .requestMatchers("/v1/governance/**").authenticated()
                    .anyRequest().authenticated())
            .authenticationProvider(authenticationProvider())
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        // Origin *patterns* rather than exact origins: allowCredentials(true)
        // forbids a bare "*" in setAllowedOrigins, and the Vite dev server
        // shifts ports (5173 -> 5174 -> ...) whenever a previous instance is
        // still running. An unmatched origin is rejected by Spring's CORS
        // filter with "403 Invalid CORS request" before authentication runs,
        // which surfaces in the UI as a failed login rather than a CORS error.
        config.setAllowedOriginPatterns(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList());
        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Content-Disposition"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config)
            throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(bcryptStrength);
    }
}
