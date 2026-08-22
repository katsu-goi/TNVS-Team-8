package com.photonicomega.facilities.module.security.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.domain.SecurityModule;
import com.photonicomega.facilities.module.security.service.SecurityAuditService;
import com.photonicomega.facilities.module.security.util.ClientIpResolver;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;
import java.util.regex.Pattern;

@Component
@Order(2)
@RequiredArgsConstructor
@Slf4j
public class SuspiciousRequestFilter implements Filter {

    private final SecurityAuditService securityAuditService;
    private final ObjectMapper objectMapper;

    // OWASP Threat Regex Patterns
    private static final Pattern SQL_INJECTION_PATTERN = Pattern.compile(
            "(?i)(union\\s+select|select\\s+.*\\s+from|insert\\s+into|delete\\s+from|update\\s+.*\\s+set|'\\s*or\\s*'1'\\s*=\\s*'1|\\bor\\b\\s+\\d+\\s*=\\s*\\d+)",
            Pattern.CASE_INSENSITIVE
    );

    private static final Pattern XSS_PATTERN = Pattern.compile(
            "(?i)(<script.*?>|javascript:|onload\\s*=|onerror\\s*=|alert\\(|document\\.cookie|<img\\s+src\\s*=)",
            Pattern.CASE_INSENSITIVE
    );

    private static final Pattern PATH_TRAVERSAL_PATTERN = Pattern.compile(
            "(?i)(\\.\\./|\\.\\.\\\\|/etc/passwd|/windows/win\\.ini)",
            Pattern.CASE_INSENSITIVE
    );

    /**
     * Command injection signatures. Note: the previous generic {@code ;\s*\w+}
     * and {@code &&\s*\w+} alternatives matched harmless content (e.g. the
     * Windows User-Agent "Windows NT 10.0; Win64; x64") and flagged nearly every
     * request. Only shell metacharacters in a command-execution context are kept.
     */
    private static final Pattern COMMAND_INJECTION_PATTERN = Pattern.compile(
            "(?i)(\\|\\|\\s*(ls|cat|curl|wget|rm|mv|cp|id|whoami)\\b|;\\s*(ls|cat|curl|wget|rm|mv|cp|id|whoami)\\b|&&\\s*(ls|cat|curl|wget|rm|mv|cp|id|whoami)\\b|chmod\\s+|chown\\s+)",
            Pattern.CASE_INSENSITIVE
    );

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String ip = getClientIp(httpRequest);
        String url = httpRequest.getRequestURI();

        // Check query strings and headers
        String detectedThreat = detectThreat(httpRequest);
        if (detectedThreat != null) {
            log.error("ATTACK DETECTED: Blocked suspicious request from IP: {} on URL: {} ({})", ip, url, detectedThreat);
            httpResponse.setStatus(HttpStatus.FORBIDDEN.value());
            httpResponse.setContentType(MediaType.APPLICATION_JSON_VALUE);
            ApiResponse<Void> apiResponse = ApiResponse.failure(
                    "Request blocked: suspicious content detected.", "BLOCKED_SUSPICIOUS_REQUEST");
            httpResponse.getWriter().write(objectMapper.writeValueAsString(apiResponse));

            recordBlockedEvent(httpRequest, ip, detectedThreat);
            return;
        }

        chain.doFilter(request, response);
    }

    /**
     * Persists a security log entry for the blocked request so the IP threat
     * map and audit trail reflect gateway-level attacks in real time.
     */
    private void recordBlockedEvent(HttpServletRequest request, String ip, String threat) {
        try {
            SecurityLog logEntry = SecurityLog.builder()
                    .ipAddress(ip)
                    .apiEndpoint(request.getRequestURI())
                    .httpMethod(request.getMethod())
                    .action("SUSPICIOUS_REQUEST_BLOCKED")
                    .module(SecurityModule.API_GATEWAY)
                    .status("BLOCKED")
                    .reason(threat)
                    .riskLevel(resolveRiskLevel(threat))
                    .build();
            securityAuditService.logSecurityEventAsync(logEntry);
        } catch (Exception e) {
            log.error("Failed to record blocked suspicious request", e);
        }
    }

    private RiskLevel resolveRiskLevel(String threat) {
        return switch (threat) {
            case "SQL_INJECTION", "COMMAND_INJECTION" -> RiskLevel.CRITICAL;
            case "XSS" -> RiskLevel.HIGH;
            case "PATH_TRAVERSAL" -> RiskLevel.HIGH;
            default -> RiskLevel.MEDIUM;
        };
    }

    /**
     * Returns the threat signature name when the request carries suspicious
     * content, or {@code null} when it is clean.
     */
    private String detectThreat(HttpServletRequest request) {
        // 1. Inspect Query Params
        String queryString = request.getQueryString();
        if (queryString != null) {
            try {
                String decoded = URLDecoder.decode(queryString, StandardCharsets.UTF_8);
                String threat = matchThreat(decoded);
                if (threat != null) return threat;
            } catch (Exception e) {
                String threat = matchThreat(queryString);
                if (threat != null) return threat;
            }
        }

        // 2. Inspect Parameter Map
        Enumeration<String> paramNames = request.getParameterNames();
        while (paramNames.hasMoreElements()) {
            String paramName = paramNames.nextElement();
            String[] paramValues = request.getParameterValues(paramName);
            if (paramValues != null) {
                for (String val : paramValues) {
                    String threat = matchThreat(val);
                    if (threat != null) return threat;
                }
            }
        }

        // 3. Inspect request headers
        Enumeration<String> headerNames = request.getHeaderNames();
        while (headerNames.hasMoreElements()) {
            String name = headerNames.nextElement();
            String headerVal = request.getHeader(name);
            if (headerVal != null) {
                if ("User-Agent".equalsIgnoreCase(name) || "Referer".equalsIgnoreCase(name)) {
                    String threat = matchThreat(headerVal);
                    if (threat != null) return threat;
                }
            }
        }

        return null;
    }

    private String matchThreat(String input) {
        if (input == null || input.isEmpty()) {
            return null;
        }
        if (SQL_INJECTION_PATTERN.matcher(input).find()) return "SQL_INJECTION";
        if (XSS_PATTERN.matcher(input).find()) return "XSS";
        if (PATH_TRAVERSAL_PATTERN.matcher(input).find()) return "PATH_TRAVERSAL";
        if (COMMAND_INJECTION_PATTERN.matcher(input).find()) return "COMMAND_INJECTION";
        return null;
    }

    private String getClientIp(HttpServletRequest request) {
        return ClientIpResolver.resolve(request).ip();
    }
}
