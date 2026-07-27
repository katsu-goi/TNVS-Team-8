package com.photonicomega.security.filter;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import com.photonicomega.security.service.SecurityAuditService;
import com.photonicomega.security.dto.AuditEvent;
import io.github.bucket4j.*;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitingFilter implements Filter {

    private final SecurityAuditService auditService;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Autowired
    public RateLimitingFilter(SecurityAuditService auditService) {
        this.auditService = auditService;
    }

    private Bucket resolveBucket(HttpServletRequest request) {
        String ip = request.getRemoteAddr();
        String role = request.getUserPrincipal() != null ? request.getUserPrincipal().getName() : "GUEST"; // Simplified role extraction
        String key = ip + ":" + role + ":" + request.getRequestURI();
        return buckets.computeIfAbsent(key, k -> createBucket(role, request.getRequestURI()));
    }

    private Bucket createBucket(String role, String uri) {
        // Define limits per role and per endpoint sensitivity
        Refill refill;
        long capacity;
        if (uri.matches(".*/(login|password-reset|users|contracts/approval|compliance/approval|system/settings).*")) {
            // Sensitive endpoints
            capacity = 20;
            refill = Refill.greedy(20, Duration.ofMinutes(1));
        } else if ("ADMIN".equalsIgnoreCase(role)) {
            capacity = 600;
            refill = Refill.greedy(600, Duration.ofMinutes(1));
        } else if ("USER".equalsIgnoreCase(role) || "AUTHENTICATED".equalsIgnoreCase(role)) {
            capacity = 300;
            refill = Refill.greedy(300, Duration.ofMinutes(1));
        } else {
            // Guest or unknown
            capacity = 60;
            refill = Refill.greedy(60, Duration.ofMinutes(1));
        }
        return Bucket.builder()
                .addLimit(Bandwidth.classic(capacity, refill))
                .build();
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;
        Bucket bucket = resolveBucket(request);
        if (bucket.tryConsume(1)) {
            chain.doFilter(req, res);
        } else {
            // Log rate limit breach
            AuditEvent event = new AuditEvent();
            event.setRiskLevel("MEDIUM");
            event.setStatus("RATE_LIMIT_EXCEEDED");
            event.setAction("Rate limiting triggered");
            event.setModule("SECURITY");
            event.setTimestamp(java.time.OffsetDateTime.now());
            auditService.logEvent(event);
            response.sendError(429, "Too many requests - rate limit exceeded");
        }
    }
}
