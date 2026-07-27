package com.photonicomega.facilities.module.security.filter;

import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.service.SecurityAuditService;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
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

    private static final Pattern COMMAND_INJECTION_PATTERN = Pattern.compile(
            "(?i)(\\|\\|\\s*\\w+|;\\s*\\w+|&&\\s*\\w+|chmod\\s+|chown\\s+)",
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
        if (isSuspicious(httpRequest)) {
            log.error("ATTACK DETECTED: Blocked suspicious request from IP: {} on URL: {}", ip, url);

            // Trigger security alert and blacklist IP automatically
            securityAuditService.createSecurityAlert(
                    "OWASP Threat Protection Triggered",
                    "Suspicious request parameters matching SQL injection, XSS, Command Injection, or Path Traversal rules detected from IP: " + ip + " for URI: " + url,
                    RiskLevel.CRITICAL,
                    "OWASP_TOP_10_ATTACK",
                    ip,
                    null
            );

            securityAuditService.blockIpAddress(ip, "Automated IP Blacklist: OWASP top-10 threat patterns detected in parameters.", "SYSTEM", 120L);

            httpResponse.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            httpResponse.setContentType("application/json");
            httpResponse.getWriter().write("{\"error\": \"Request rejected due to potential security violations (OWASP Top 10 protection). Network operations have logged this event and flagged the origin.\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    private boolean isSuspicious(HttpServletRequest request) {
        // 1. Inspect Query Params
        String queryString = request.getQueryString();
        if (queryString != null) {
            try {
                String decoded = URLDecoder.decode(queryString, StandardCharsets.UTF_8);
                if (matchesThreatPatterns(decoded)) {
                    return true;
                }
            } catch (Exception e) {
                // Ignore decoding error, fall back to checker
                if (matchesThreatPatterns(queryString)) {
                    return true;
                }
            }
        }

        // 2. Inspect Parameter Map
        Enumeration<String> paramNames = request.getParameterNames();
        while (paramNames.hasMoreElements()) {
            String paramName = paramNames.nextElement();
            String[] paramValues = request.getParameterValues(paramName);
            if (paramValues != null) {
                for (String val : paramValues) {
                    if (matchesThreatPatterns(val)) {
                        return true;
                    }
                }
            }
        }

        // 3. Inspect request headers
        Enumeration<String> headerNames = request.getHeaderNames();
        while (headerNames.hasMoreElements()) {
            String name = headerNames.nextElement();
            String headerVal = request.getHeader(name);
            if (headerVal != null && matchesThreatPatterns(headerVal)) {
                // Limit check to custom elements if necessary but check User-Agent for command injection
                if ("User-Agent".equalsIgnoreCase(name) || "Referer".equalsIgnoreCase(name)) {
                    if (matchesThreatPatterns(headerVal)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private boolean matchesThreatPatterns(String input) {
        if (input == null || input.isEmpty()) {
            return false;
        }
        return SQL_INJECTION_PATTERN.matcher(input).find()
                || XSS_PATTERN.matcher(input).find()
                || PATH_TRAVERSAL_PATTERN.matcher(input).find()
                || COMMAND_INJECTION_PATTERN.matcher(input).find();
    }

    private String getClientIp(HttpServletRequest request) {
        String xHeader = request.getHeader("X-Forwarded-For");
        if (xHeader != null && !xHeader.isEmpty()) {
            return xHeader.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
