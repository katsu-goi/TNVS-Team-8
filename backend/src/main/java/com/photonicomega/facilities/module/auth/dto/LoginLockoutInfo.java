package com.photonicomega.facilities.module.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Structured lockout state returned to the client on a failed login. The
 * counters are authoritative server-side state; the client only uses the
 * values to render attempt progress and the progressive countdown.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginLockoutInfo {
    private int failedAttempts;
    private int maxAttempts;
    private int remainingAttempts;
    private long lockSecondsRemaining;
    private boolean permanentlyLocked;
    private LocalDateTime lockedUntil;
}
