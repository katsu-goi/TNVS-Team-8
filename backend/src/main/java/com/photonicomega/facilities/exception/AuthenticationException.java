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
}
