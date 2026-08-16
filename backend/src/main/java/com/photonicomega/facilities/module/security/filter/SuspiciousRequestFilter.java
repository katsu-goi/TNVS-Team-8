package com.photonicomega.facilities.module.security.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.security.service.SecurityAuditService;
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
        if (isSuspicious(httpRequest)) {
            log.error("ATTACK DETECTED: Blocked suspicious request from IP: {} on URL: {}", ip, url);
            httpResponse.setStatus(HttpStatus.FORBIDDEN.value());
            httpResponse.setContentType(MediaType.APPLICATION_JSON_VALUE);
            ApiResponse<Void> apiResponse = ApiResponse.failure(
                    "Request blocked: suspicious content detected.", "BLOCKED_SUSPICIOUS_REQUEST");
            httpResponse.getWriter().write(objectMapper.writeValueAsString(apiResponse));
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
