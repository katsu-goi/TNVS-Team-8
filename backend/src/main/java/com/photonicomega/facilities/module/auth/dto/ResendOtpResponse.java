package com.photonicomega.facilities.module.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResendOtpResponse {
    private int otpExpirySeconds;
    private String message;
}
