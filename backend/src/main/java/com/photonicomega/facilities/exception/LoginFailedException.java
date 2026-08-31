package com.photonicomega.facilities.exception;

import com.photonicomega.facilities.module.auth.dto.LoginLockoutInfo;
import lombok.Getter;

/**
 * Raised for every failed login attempt that maps to a known account, and for
 * any attempt against an account that is currently locked out (progressive
 * temporary countdown). Carries only the retry timing exposed to the client;
 * attempt counters remain server-side.
 */
@Getter
public class LoginFailedException extends AuthenticationException {

    private final LoginLockoutInfo info;

    public LoginFailedException(String message, String errorCode, LoginLockoutInfo info) {
        super(message, errorCode);
        this.info = info;
    }
}
