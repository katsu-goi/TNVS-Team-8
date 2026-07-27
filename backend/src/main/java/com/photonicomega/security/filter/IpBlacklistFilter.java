package com.photonicomega.security.filter;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import com.photonicomega.security.repository.BlockedIpRepository;
import java.io.IOException;

@Component
public class IpBlacklistFilter implements Filter {

    private final BlockedIpRepository blockedIpRepository;

    @Autowired
    public IpBlacklistFilter(BlockedIpRepository blockedIpRepository) {
        this.blockedIpRepository = blockedIpRepository;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        String ip = request.getRemoteAddr();
        if (blockedIpRepository.findById(ip).isPresent()) {
            HttpServletResponse httpResponse = (HttpServletResponse) response;
            httpResponse.sendError(HttpServletResponse.SC_FORBIDDEN, "IP address blocked");
            return;
        }
        chain.doFilter(request, response);
    }
}
