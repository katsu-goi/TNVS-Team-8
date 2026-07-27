package com.photonicomega.facilities.module.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginInitResponse {
    private UUID userId;
    private String email;
    private int otpExpirySeconds;
    private String message;
}
