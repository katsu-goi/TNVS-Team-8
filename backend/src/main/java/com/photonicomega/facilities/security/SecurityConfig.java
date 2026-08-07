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
            "/v3/api-docs/**",
            "/swagger-ui/**",
            "/swagger-ui.html",
            "/actuator/health",
            "/actuator/info",
            "/files/**",
            "/ws-endpoint/**"
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
                    .requestMatchers("/v1/admin/**").hasAnyRole("ADMIN", "SUPER_ADMIN")
                    .requestMatchers("/v1/facilities-manager/**").hasRole("FACILITIES_MANAGER")
                    .requestMatchers("/v1/facilities-officer/**").hasRole("FACILITIES_OFFICER")
                    .requestMatchers("/v1/compliance/**").hasRole("COMPLIANCE_OFFICER")
                    .requestMatchers("/v1/legal/**").hasRole("LEGAL_OFFICER")
                    .requestMatchers("/v1/procurement/**").hasRole("CONTRACT_OFFICER")
                    .requestMatchers("/v1/employee/**").hasRole("EMPLOYEE")
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
