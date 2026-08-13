package com.photonicomega.facilities.module.auth.dto;

import com.photonicomega.facilities.common.validation.CorporateEmail;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class LoginRequest {
    @NotBlank(message = "Email is required")
    @CorporateEmail
    private String email;

    @NotBlank(message = "Password is required")
    private String password;
}
