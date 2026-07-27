package com.photonicomega.security.filter;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import com.photonicomega.security.service.SecurityAuditService;
import com.photonicomega.security.dto.AuditEvent;
import org.springframework.beans.factory.annotation.Autowired;
import java.io.IOException;
import java.util.regex.Pattern;

@Component
public class SuspiciousRequestFilter implements Filter {

    private final SecurityAuditService auditService;

    @Autowired
    public SuspiciousRequestFilter(SecurityAuditService auditService) {
        this.auditService = auditService;
    }

    // Simple patterns for demonstration – in production use a robust library
    private static final Pattern SQLI_PATTERN = Pattern.compile("(?i)(union\s+select|or\s+1=1|--|;|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b)");
    private static final Pattern XSS_PATTERN = Pattern.compile("(?i)<script|javascript:|onerror|onload");
    private static final Pattern PATH_TRAVERSAL_PATTERN = Pattern.compile("(\\.\\./|/etc/passwd|/proc/|\\\\)");
    private static final Pattern CMD_INJECTION_PATTERN = Pattern.compile("(;|&&|\\|\\|)\\s*(\\w+\\s*){1,3}");

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        String query = httpRequest.getQueryString();
        String uri = httpRequest.getRequestURI();
        String payload = httpRequest.getMethod().equalsIgnoreCase("POST") ? httpRequest.getReader().lines().reduce("", (a,b) -> a + b) : "";
        String combined = (query != null ? query : "") + " " + uri + " " + payload;

        boolean suspicious = false;
        String reason = null;
        if (SQLI_PATTERN.matcher(combined).find()) { suspicious = true; reason = "SQL Injection attempt"; }
        else if (XSS_PATTERN.matcher(combined).find()) { suspicious = true; reason = "XSS attempt"; }
        else if (PATH_TRAVERSAL_PATTERN.matcher(combined).find()) { suspicious = true; reason = "Path Traversal attempt"; }
        else if (CMD_INJECTION_PATTERN.matcher(combined).find()) { suspicious = true; reason = "Command Injection attempt"; }

        if (suspicious) {
            // Log audit event with HIGH risk
            AuditEvent event = new AuditEvent();
            // Populate minimal fields – in a real app you would extract user info from SecurityContext
            event.setRiskLevel("HIGH");
            event.setStatus("DETECTED");
            event.setAction(reason);
            event.setModule("SECURITY");
            event.setTimestamp(java.time.OffsetDateTime.now());
            auditService.logEvent(event);

            // Create security alert entry via service (not implemented here) – for now just block response
            HttpServletResponse httpResponse = (HttpServletResponse) response;
            httpResponse.sendError(HttpServletResponse.SC_FORBIDDEN, reason);
            return;
        }
        chain.doFilter(request, response);
    }
}
