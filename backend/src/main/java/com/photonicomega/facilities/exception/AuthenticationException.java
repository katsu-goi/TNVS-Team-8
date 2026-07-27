package com.photonicomega.facilities.exception;

import lombok.Getter;

@Getter
public class AuthenticationException extends RuntimeException {
    private final String errorCode;

    public AuthenticationException(String message, String errorCode) {
        super(message);
        this.errorCode = errorCode;
    }

    public static AuthenticationException invalidToken() {
        return new AuthenticationException("Invalid or expired token", "INVALID_TOKEN");
    }

    public static AuthenticationException otpExpired() {
        return new AuthenticationException("OTP has expired", "OTP_EXPIRED");
    }

    public static AuthenticationException otpInvalid() {
        return new AuthenticationException("Invalid OTP code", "OTP_INVALID");
    }

    public static AuthenticationException otpMaxAttempts() {
        return new AuthenticationException(
                "Maximum OTP verification attempts exceeded. Please wait 15 minutes.", "OTP_MAX_ATTEMPTS");
    }

    public static AuthenticationException otpLocked() {
        return new AuthenticationException(
                "OTP verification is locked. Please wait 15 minutes before trying again.", "OTP_LOCKED");
    }
}
