package com.photonicomega.facilities.module.security.filter;

import com.photonicomega.facilities.module.security.repository.BlockedIpRepository;
import com.photonicomega.facilities.module.security.util.ClientIpResolver;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@Order(1)
@RequiredArgsConstructor
@Slf4j
public class IpBlacklistFilter implements Filter {

    private final BlockedIpRepository blockedIpRepository;

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String clientIp = getClientIp(httpRequest);

        if (clientIp.equals("0:0:0:0:0:0:0:1") || clientIp.equals("127.0.0.1") || clientIp.equals("::1") || clientIp.equals("localhost")) {
            chain.doFilter(request, response);
            return;
        }

        if (blockedIpRepository.existsByIpAddressAndStatus(clientIp, "ACTIVE")) {
            log.warn("SECURITY WARNING: Rejected request from blacklisted IP address: {}", clientIp);
            httpResponse.setStatus(HttpServletResponse.SC_FORBIDDEN);
            httpResponse.setContentType("application/json");
            httpResponse.getWriter().write("{\"error\": \"Access Denied: Your IP address has been blacklisted due to security violations.\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    private String getClientIp(HttpServletRequest request) {
        return ClientIpResolver.resolve(request).ip();
    }
}
