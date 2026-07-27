package com.photonicomega.facilities.module.security.config;

import com.photonicomega.facilities.module.security.filter.SecurityAuditInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class SecurityMvcConfig implements WebMvcConfigurer {

    private final SecurityAuditInterceptor securityAuditInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(securityAuditInterceptor)
                .addPathPatterns("/api/v1/**");
    }
}
