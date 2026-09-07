package com.photonicomega.facilities.module.security.filter;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.domain.SecurityModule;
import com.photonicomega.facilities.module.security.service.SecurityAuditService;
import com.photonicomega.facilities.module.security.service.geo.IpGeolocationService;
import com.photonicomega.facilities.module.security.util.ClientIpResolver;
import com.photonicomega.facilities.module.security.util.GeoJson;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
@Slf4j
public class SecurityAuditInterceptor implements HandlerInterceptor {

    private final SecurityAuditService securityAuditService;
    private final UserRepository userRepository;
    private final IpGeolocationService ipGeolocationService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute("startTime", System.currentTimeMillis());
        request.setAttribute("requestId", UUID.randomUUID().toString());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        try {
            long startTime = (Long) request.getAttribute("startTime");
            long duration = System.currentTimeMillis() - startTime;
            String requestId = (String) request.getAttribute("requestId");
            
            String ip = getClientIp(request);
            String url = request.getRequestURI();
            String method = request.getMethod();
            int status = response.getStatus();
            String userAgent = request.getHeader("User-Agent");            // Extract OS and Browser
            String os = parseOS(userAgent);
            String browser = parseBrowser(userAgent);

            // Resolve the real authenticated identity from Spring Security,
            // never a fabricated/session-stamped admin.
            SecurityAuditSubject subject = resolveSubject(request);

            // Decide Module, Action, and Risk Level dynamically
            SecurityModule module = resolveModule(url);
            String action = resolveAction(method, url);
            RiskLevel risk = resolveRiskLevel(status, method, url);

            // Persist cached geolocation (non-blocking, cache-only) with the log
            // so the event carries its geographic context without a network call.
            String geoLocation = enrichGeoLocation(ip);

            SecurityLog logEntry = SecurityLog.builder()
                    .timestamp(Instant.now())
                    .userId(subject.userId())
                    .username(subject.username())
                    .fullName(subject.fullName())
                    .role(subject.role())
                    .department(subject.department())
                    .ipAddress(ip)
                    .deviceName(userAgent != null && userAgent.length() > 80 ? userAgent.substring(0, 80) : userAgent)
                    .browser(browser)
                    .operatingSystem(os)
                    .sessionId(request.getSession(false) != null ? request.getSession().getId() : "N/A")
                    .requestId(requestId)
                    .apiEndpoint(url)
                    .httpMethod(method)
                    .action(action)
                    .module(module)
                    .status(status >= 400 ? "FAILED" : "SUCCESS")
                    .reason(ex != null ? ex.getMessage() : (status >= 400 ? "HTTP status " + status : "Normal completion"))
                    .riskLevel(risk)
                    .geoLocation(geoLocation)
                    .build();

            // Run asynchronously
            securityAuditService.logSecurityEventAsync(logEntry);

            // If sensitive file access or critical deletion, raise a warning log/alert
            if (risk == RiskLevel.CRITICAL || risk == RiskLevel.HIGH) {
                securityAuditService.createSecurityAlert(
                        "High/Critical Operation Logged",
                        action + " performed by " + subject.username() + " on " + url + " - Status: " + status,
                        risk,
                        "AUDIT_ALERT",
                        ip,
                        subject.userId()
                );
            }

        } catch (Exception e) {
            log.error("Failed to intercept security audit log", e);
        }
    }

    /**
     * Resolves the authenticated caller from the Spring Security context,
     * enriched with the matching {@code users} row for full name + department.
     * Falls back to an anonymous subject when no authentication is present.
     */
    private SecurityAuditSubject resolveSubject(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return new SecurityAuditSubject("anonymous", "anonymous", "Anonymous User", "GUEST", "EXTERNAL");
        }

        String username = authentication.getName();
        Set<String> roles = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority.startsWith("ROLE_"))
                .map(authority -> authority.substring("ROLE_".length()))
                .collect(Collectors.toSet());

        String role = roles.isEmpty() ? "AUTHENTICATED" : String.join(",", roles);

        User user = userRepository.findByEmailAndDeletedFalse(username).orElse(null);
        if (user != null) {
            String fullName = user.getFirstName() + " " + user.getLastName();
            return new SecurityAuditSubject(
                    user.getEmail(),
                    user.getId().toString(),
                    fullName.trim(),
                    role,
                    user.getDepartment() != null ? user.getDepartment() : "NOT_SET");
        }

        return new SecurityAuditSubject(username, username, username, role, "NOT_SET");
    }

    /**
     * Immutable snapshot of the audit subject resolved from the security context.
     */
    private record SecurityAuditSubject(
            String username,
            String userId,
            String fullName,
            String role,
            String department) {
    }

    private String getClientIp(HttpServletRequest request) {
        return ClientIpResolver.resolve(request).ip();
    }

    /**
     * Reads cached geolocation for the IP (never performs a network lookup)
     * and serializes it as JSON for the {@code geo_location} column.
     */
    private String enrichGeoLocation(String ip) {
        if (ip == null || ip.isBlank()) {
            return null;
        }
        try {
            return ipGeolocationService.peek(ip).map(GeoJson::toCompactJson).orElse(null);
        } catch (Exception e) {
            return null;
        }
    }

    private String parseOS(String userAgent) {
        if (userAgent == null) return "Unknown";
        if (userAgent.contains("Windows")) return "Windows";
        if (userAgent.contains("Macintosh") || userAgent.contains("Mac OS X")) return "macOS";
        if (userAgent.contains("Linux")) return "Linux";
        if (userAgent.contains("Android")) return "Android";
        if (userAgent.contains("iPhone") || userAgent.contains("iPad")) return "iOS";
        return "Other";
    }

    private String parseBrowser(String userAgent) {
        if (userAgent == null) return "Unknown";
        if (userAgent.contains("Edge")) return "Edge";
        if (userAgent.contains("Chrome")) return "Chrome";
        if (userAgent.contains("Safari") && !userAgent.contains("Chrome")) return "Safari";
        if (userAgent.contains("Firefox")) return "Firefox";
        return "Other";
    }

    private SecurityModule resolveModule(String url) {
        if (url.contains("/auth")) return SecurityModule.AUTHENTICATION;
        if (url.contains("/users")) return SecurityModule.USER_MANAGEMENT;
        if (url.contains("/facilities")) return SecurityModule.FACILITIES;
        if (url.contains("/visitor")) return SecurityModule.VISITOR_MANAGEMENT;
        if (url.contains("/documents")) return SecurityModule.DOCUMENTS;
        if (url.contains("/legal")) return SecurityModule.LEGAL_CASES;
        if (url.contains("/contracts")) return SecurityModule.CONTRACTS;
        if (url.contains("/security/admin")) return SecurityModule.ADMIN_OPERATIONS;
        return SecurityModule.API_GATEWAY;
    }

    private String resolveAction(String method, String url) {
        String prefix = "READ";
        if ("POST".equalsIgnoreCase(method)) prefix = "CREATE";
        if ("PUT".equalsIgnoreCase(method) || "PATCH".equalsIgnoreCase(method)) prefix = "UPDATE";
        if ("DELETE".equalsIgnoreCase(method)) prefix = "DELETE";

        String target = "RESOURCE";
        if (url.contains("/auth/login")) return "LOGIN_SUCCESS";
        if (url.contains("/auth/logout")) return "LOGOUT";
        if (url.contains("/facilities")) target = "FACILITY_ROOM";
        if (url.contains("/visitor")) target = "VISITOR_RECORD";
        if (url.contains("/documents")) target = "DOCUMENT";
        if (url.contains("/legal")) target = "LEGAL_CASE";
        if (url.contains("/contracts")) target = "CONTRACT";
        if (url.contains("/security/admin")) target = "SECURITY_SETTINGS";

        return prefix + "_" + target;
    }

    private RiskLevel resolveRiskLevel(int status, String method, String url) {
        if (status >= 400) {
            if (url.contains("/auth/login")) return RiskLevel.MEDIUM;
            return RiskLevel.LOW;
        }

        if ("DELETE".equalsIgnoreCase(method)) {
            if (url.contains("/documents") || url.contains("/contracts") || url.contains("/legal")) {
                return RiskLevel.HIGH;
            }
            return RiskLevel.MEDIUM;
        }

        if ("POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method)) {
            if (url.contains("/security/admin") || url.contains("/auth/reset-password")) {
                return RiskLevel.CRITICAL;
            }
            return RiskLevel.MEDIUM;
        }

        // Sensitive reads
        if ("GET".equalsIgnoreCase(method)) {
            if (url.contains("/security/admin") || url.contains("/contracts") || url.contains("/legal")) {
                return RiskLevel.MEDIUM;
            }
        }

        return RiskLevel.LOW;
    }
}
