package com.photonicomega.facilities.module.security.filter;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.domain.SecurityModule;
import com.photonicomega.facilities.module.security.service.SecurityAuditService;
import com.photonicomega.facilities.module.security.util.ClientIpResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Order(3)
@RequiredArgsConstructor
@Slf4j
public class RateLimitingFilter implements Filter {

    private final SecurityAuditService securityAuditService;

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
            httpResponse.setHeader("Retry-After", "60");
            httpResponse.getWriter().write("{\"error\": \"Too Many Requests: You have exceeded the permitted request quota. Please slow down and try again later.\"}");

            recordRateLimitEvent(httpRequest, ip, path);
        }
    }

    /**
     * Persists a security log entry for the rate-limited request so the IP
     * threat map reflects high-volume (bot/brute-force) sources in real time.
     */
    private void recordRateLimitEvent(HttpServletRequest request, String ip, String path) {
        try {
            SecurityLog logEntry = SecurityLog.builder()
                    .ipAddress(ip)
                    .apiEndpoint(path)
                    .httpMethod(request.getMethod())
                    .action("RATE_LIMIT_EXCEEDED")
                    .module(SecurityModule.API_GATEWAY)
                    .status("BLOCKED")
                    .reason("Too many requests (HTTP 429) on " + path)
                    .riskLevel(RiskLevel.MEDIUM)
                    .build();
            securityAuditService.logSecurityEventAsync(logEntry);
        } catch (Exception e) {
            log.error("Failed to record rate-limit security event", e);
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
        return ClientIpResolver.resolve(request).ip();
    }
}
