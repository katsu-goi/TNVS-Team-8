package com.photonicomega.security.interceptor;

import com.photonicomega.security.dto.AuditEvent;
import com.photonicomega.security.service.SecurityAuditService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import java.time.OffsetDateTime;
import java.util.UUID;

@Component
public class SecurityAuditInterceptor implements HandlerInterceptor {

    private final SecurityAuditService auditService;

    @Autowired
    public SecurityAuditInterceptor(SecurityAuditService auditService) {
        this.auditService = auditService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // Build minimal audit event; more details can be added from SecurityContext later
        AuditEvent event = new AuditEvent();
        // Attempt to get user info from Spring Security context if available
        try {
            var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && !(auth.getPrincipal() instanceof String && ((String) auth.getPrincipal()).equals("anonymousUser"))) {
                // Assuming principal provides getId, getFullName, getAuthorities etc.
                Object principal = auth.getPrincipal();
                // Use reflection or known interface; here we just set placeholder values
                // In a real app, replace with actual user details extraction
                if (principal instanceof com.photonicomega.security.dto.AuditEvent) {
                    // no-op, placeholder
                }
                // For demonstration, set dummy UUID (replace with real user ID)
                event.setUserId(UUID.randomUUID());
                event.setFullName(auth.getName());
                event.setRole(auth.getAuthorities().toString());
            }
        } catch (Exception e) {
            // ignore if security context not available
        }
        event.setTimestamp(OffsetDateTime.now());
        event.setIpAddress(request.getRemoteAddr());
        event.setBrowser(request.getHeader("User-Agent"));
        event.setOs("unknown"); // OS parsing can be added
        event.setDevice("unknown");
        event.setApiEndpoint(request.getRequestURI());
        event.setHttpMethod(request.getMethod());
        event.setAction("REQUEST");
        event.setModule("SECURITY");
        event.setRiskLevel("LOW");
        event.setStatus("RECEIVED");
        auditService.logEvent(event);
        return true;
    }
}
