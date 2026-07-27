package com.photonicomega.facilities.module.security.filter;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Order(3)
@Slf4j
public class RateLimitingFilter implements Filter {

    // Store buckets mapped by IP or username
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String ip = getClientIp(httpRequest);
        String path = httpRequest.getRequestURI();
        String role = getRoleFromHeaderOrToken(httpRequest);

        String limitKey = ip + ":" + path; // Simple limit key per path and IP
        Bucket bucket = buckets.computeIfAbsent(limitKey, k -> createNewBucket(role, path));

        if (bucket.tryConsume(1)) {
            chain.doFilter(request, response);
        } else {
            log.warn("RATE LIMIT TRIGGERED: Blocked IP {} for path {}", ip, path);
            httpResponse.setStatus(429); // Too Many Requests
            httpResponse.setContentType("application/json");
            httpResponse.getWriter().write("{\"error\": \"Too Many Requests: You have exceeded the permitted request quota. Please slow down and try again later.\"}");
        }
    }

    private Bucket createNewBucket(String role, String path) {
        // 1. Sensitive APIs (20 requests/minute)
        if (isSensitiveEndpoint(path)) {
            return Bucket.builder()
                    .addLimit(Bandwidth.builder()
                            .capacity(20)
                            .refillIntervally(20, Duration.ofMinutes(1))
                            .build())
                    .build();
        }

        // 2. Admin (600 requests/minute)
        if ("ROLE_ADMIN".equalsIgnoreCase(role)) {
            return Bucket.builder()
                    .addLimit(Bandwidth.builder()
                            .capacity(600)
                            .refillIntervally(600, Duration.ofMinutes(1))
                            .build())
                    .build();
        }

        // 3. Authenticated User (300 requests/minute)
        if ("ROLE_USER".equalsIgnoreCase(role)) {
            return Bucket.builder()
                    .addLimit(Bandwidth.builder()
                            .capacity(300)
                            .refillIntervally(300, Duration.ofMinutes(1))
                            .build())
                    .build();
        }

        // 4. Guest (60 requests/minute)
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(60)
                        .refillIntervally(60, Duration.ofMinutes(1))
                        .build())
                .build();
    }

    private boolean isSensitiveEndpoint(String path) {
        return path.contains("/auth/login") 
                || path.contains("/auth/otp") 
                || path.contains("/security/admin") 
                || path.contains("/auth/reset-password");
    }

    private String getRoleFromHeaderOrToken(HttpServletRequest request) {
        // Standard check: extract basic bearer token or header representation
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            // Simplified for mockup/filter setup when JWT filter isn't fully processed yet.
            // If the token is 'mock-jwt-token-access', it represents admin role
            if (authHeader.contains("admin") || authHeader.contains("access")) {
                return "ROLE_ADMIN";
            }
            return "ROLE_USER";
        }
        return "GUEST";
    }

    private String getClientIp(HttpServletRequest request) {
        String xHeader = request.getHeader("X-Forwarded-For");
        if (xHeader != null && !xHeader.isEmpty()) {
            return xHeader.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
