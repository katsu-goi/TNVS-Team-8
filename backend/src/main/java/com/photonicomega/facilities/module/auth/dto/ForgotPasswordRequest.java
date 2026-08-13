package com.photonicomega.facilities.module.auth.dto;

import com.photonicomega.facilities.common.validation.CorporateEmail;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ForgotPasswordRequest {
    @NotBlank(message = "Email is required")
    @CorporateEmail
    private String email;
}
