package com.photonicomega.facilities.exception;

import com.photonicomega.facilities.module.auth.dto.LoginLockoutInfo;
import lombok.Getter;

/**
 * Raised for every failed login attempt that maps to a known account, and for
 * any attempt against an account that is currently locked out (progressive
 * countdown or permanent lock). Carries the server-side lockout state so the
 * exception handler can render the attempt counter and remaining countdown.
 */
@Getter
public class LoginFailedException extends AuthenticationException {

    private final LoginLockoutInfo info;

    public LoginFailedException(String message, String errorCode, LoginLockoutInfo info) {
        super(message, errorCode);
        this.info = info;
    }
}
