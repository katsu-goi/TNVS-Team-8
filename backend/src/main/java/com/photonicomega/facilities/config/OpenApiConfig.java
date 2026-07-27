package com.photonicomega.facilities.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Bean
    public OpenAPI facilitiesOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Facilities & Administrative Management System API")
                        .version("1.0.0")
                        .description("AI-Powered Facilities and Administrative Management System " +
                                "for Ride-Hailing Companies — Part of the Photonic Omega Enterprise MIS")
                        .contact(new Contact()
                                .name("Photonic Omega Team")
                                .email("admin@photonicomega.com"))
                        .license(new License()
                                .name("Proprietary")
                                .url("https://photonicomega.com")))
                .servers(List.of(
                        new Server().url("/api").description("Default API Server"),
                        new Server().url("http://localhost:8080/api").description("Local Development")))
                .components(new Components()
                        .addSecuritySchemes("bearerAuth",
                                new SecurityScheme()
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")
                                        .description("JWT Authorization header using the Bearer scheme")))
                .addSecurityItem(new SecurityRequirement().addList("bearerAuth"));
    }
}
