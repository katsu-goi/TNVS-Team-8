package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.module.auth.domain.AuditSeverity;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.dto.LoginLockoutInfo;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.service.SecurityAuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

/**
 * Server-side failed-login tracking and progressive lockout enforcement.
 *
 * Every mutation runs in a {@code REQUIRES_NEW} transaction so the attempt
 * counters survive even when the surrounding login transaction rolls back
 * after an authentication failure. Because state lives in the database the
 * lockout cannot be bypassed by refreshing the page, opening another browser,
 * or clearing browser storage - the lock is evaluated before any password is
 * ever checked.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class LoginAttemptService {

    private final UserRepository userRepository;
    private final AuditService auditService;
    private final SecurityAuditService securityAuditService;

    @Value("${app.security.login.max-attempts:3}")
    private int maxAttempts;

    /** Comma-separated progressive lock durations in seconds, index = attempt number. */
    @Value("${app.security.login.lock-duration-seconds:10,30}")
    private String lockDurations;

    @Value("${app.security.login.permanent-lock-duration-days:365}")
    private long permanentLockDurationDays;

    /**
     * Evaluates whether the account may currently attempt a login. Returns the
     * lockout state when the account is locked (progressive countdown or
     * permanent lock), otherwise {@code null}. Runs before authentication so a
     * locked account can never be brute-forced during the lockout window.
     */
    public LoginLockoutInfo getCurrentLockoutInfo(String email) {
        User user = userRepository.findByEmailAndDeletedFalse(email).orElse(null);
        if (user == null) {
            return null;
        }
        boolean permanentlyLocked = user.getFailedLoginAttempts() >= maxAttempts;
        if (permanentlyLocked) {
            return infoOf(user, true);
        }
        if (user.isAccountLocked()) {
            return infoOf(user, false);
        }
        return null;
    }

    /**
     * Records one failed password attempt and applies the progressive lock:
     * attempt 1 locks for the first configured duration, attempt 2 for the
     * second, and the {@code maxAttempts}-th failure locks the account
     * permanently. Returns {@code null} when no such account exists so the
     * caller can fall back to a generic error without leaking account existence.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public LoginLockoutInfo recordFailedAttempt(String email, String ipAddress, String userAgent) {
        User user = userRepository.findByEmailAndDeletedFalse(email).orElse(null);
        if (user == null) {
            return null;
        }

        user.incrementFailedAttempts();
        user.setLastFailedAttemptAt(LocalDateTime.now());

        int attempts = user.getFailedLoginAttempts();
        boolean permanent = attempts >= maxAttempts;
        if (permanent) {
            user.lockAccountPermanently(permanentLockDurationDays);
        } else {
            user.lockAccountSeconds(lockDurationFor(attempts));
        }
        userRepository.save(user);

        auditService.logWithSeverity(user, "LOGIN_FAILED", "AUTH", "User",
                user.getId().toString(),
                "Failed login attempt " + attempts + "/" + maxAttempts,
                ipAddress, AuditSeverity.WARNING);
        securityAuditService.logLoginAttemptAsync(user.getEmail(), user.getId().toString(),
                ipAddress, "FAILED", "INVALID_CREDENTIALS", userAgent);

        if (permanent) {
            log.warn("ACCOUNT LOCKED: {} locked after {} consecutive failed attempts from {}",
                    user.getEmail(), attempts, ipAddress);
            auditService.logWithSeverity(user, "ACCOUNT_LOCKED", "AUTH", "User",
                    user.getId().toString(),
                    "Account locked after " + attempts + " consecutive failed login attempts",
                    ipAddress, AuditSeverity.CRITICAL);
            securityAuditService.logLoginAttemptAsync(user.getEmail(), user.getId().toString(),
                    ipAddress, "LOCKED", "MAX_FAILED_ATTEMPTS", userAgent);
            securityAuditService.createSecurityAlert(
                    "Account locked - repeated failed logins",
                    "Account " + user.getEmail() + " locked after " + attempts + " failed attempts",
                    RiskLevel.HIGH, "ACCOUNT_LOCKOUT", ipAddress, user.getId().toString());
        }

        return infoOf(user, permanent);
    }

    private long lockDurationFor(int attempt) {
        List<Long> durations = Arrays.stream(lockDurations.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Long::parseLong)
                .toList();
        int index = attempt - 1;
        if (durations.isEmpty()) {
            return 30;
        }
        return durations.get(Math.min(index, durations.size() - 1));
    }

    private LoginLockoutInfo infoOf(User user, boolean permanentlyLocked) {
        long remainingSeconds = permanentlyLocked ? 0 : user.remainingLockSeconds();
        return LoginLockoutInfo.builder()
                .failedAttempts(user.getFailedLoginAttempts())
                .maxAttempts(maxAttempts)
                .remainingAttempts(Math.max(0, maxAttempts - user.getFailedLoginAttempts()))
                .lockSecondsRemaining(remainingSeconds)
                .permanentlyLocked(permanentlyLocked)
                .lockedUntil(user.getLockedUntil())
                .build();
    }
}
