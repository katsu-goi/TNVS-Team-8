package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.module.auth.domain.*;
import com.photonicomega.facilities.module.auth.dto.LoginLockoutInfo;
import com.photonicomega.facilities.module.auth.repository.*;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.service.SecurityAuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import jakarta.persistence.EntityManager;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

/** Database-authoritative progressive, temporary-only login restriction policy. */
@Service
@RequiredArgsConstructor
@Slf4j
public class LoginAttemptService {
    private static final Duration UNKNOWN_STATE_TTL = Duration.ofHours(24);
    private static final Object[] IDENTIFIER_LOCKS = new Object[64];

    static {
        Arrays.setAll(IDENTIFIER_LOCKS, ignored -> new Object());
    }

    private final UserRepository userRepository;
    private final LoginIdentifierAttemptRepository identifierAttemptRepository;
    private final AuditService auditService;
    private final SecurityAuditService securityAuditService;
    private final EntityManager entityManager;
    private final Environment environment;

    @Value("${app.security.login.lock-duration-seconds:30,60,300,900,1800,3600}")
    private String lockDurations;

    @Value("${app.jwt.secret}")
    private String identifierHmacSecret;

    public LoginLockoutInfo getCurrentLockoutInfo(String email) {
        User user = userRepository.findByEmailAndDeletedFalse(email).orElse(null);
        if (user != null) {
            return user.isAccountLocked() ? infoOf(user, false, user.getEmail()) : null;
        }

        String reference = identifierReference(email);
        LoginIdentifierAttempt state = identifierAttemptRepository
                .findByLimitKeyAndWindowStart(unknownKey(reference), 0).orElse(null);
        if (state == null || isExpired(state)) return null;
        Instant retryAt = retryAt(state.getRequestCount(), state.getUpdatedAt());
        return retryAt != null && retryAt.isAfter(Instant.now())
                ? infoOf(null, false, safeIdentifier(reference), state.getRequestCount(), retryAt)
                : null;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public LoginLockoutInfo recordFailedAttempt(String email, String ipAddress, String userAgent) {
        User user = userRepository.findByEmailAndDeletedFalseForUpdate(email).orElse(null);
        if (user != null) {
            if (user.isAccountLocked()) {
                LoginLockoutInfo info = infoOf(user, false, user.getEmail());
                recordBlockedEvents(user, user.getEmail(), info, ipAddress, userAgent);
                return info;
            }

            user.incrementFailedAttempts();
            user.setLastFailedAttemptAt(LocalDateTime.now(ZoneOffset.UTC));
            int attempts = user.getFailedLoginAttempts();
            long duration = lockDurationFor(attempts);
            user.setLockedUntil(duration > 0 ? LocalDateTime.now(ZoneOffset.UTC).plusSeconds(duration) : null);
            userRepository.save(user);

            LoginLockoutInfo info = infoOf(user, true, user.getEmail());
            recordFailureEvents(user, user.getEmail(), info, ipAddress, userAgent);
            return info;
        }

        String reference = identifierReference(email);
        synchronized (IDENTIFIER_LOCKS[Math.floorMod(reference.hashCode(), IDENTIFIER_LOCKS.length)]) {
            return recordUnknownFailure(reference, ipAddress, userAgent);
        }
    }

    private LoginLockoutInfo recordUnknownFailure(String reference, String ipAddress, String userAgent) {
        String key = unknownKey(reference);
        lockUnknownIdentifier(key);
        LoginIdentifierAttempt state = identifierAttemptRepository.findLoginStateForUpdate(key).orElse(null);
        Instant now = Instant.now();
        if (state == null) {
            state = LoginIdentifierAttempt.builder()
                    .limitKey(key).windowStart(0).requestCount(0).createdAt(now).updatedAt(now).build();
        } else if (isExpired(state)) {
            state.setRequestCount(0);
        } else {
            Instant activeRetry = retryAt(state.getRequestCount(), state.getUpdatedAt());
            if (activeRetry != null && activeRetry.isAfter(now)) {
                LoginLockoutInfo info = infoOf(null, false, safeIdentifier(reference), state.getRequestCount(), activeRetry);
                recordBlockedEvents(null, safeIdentifier(reference), info, ipAddress, userAgent);
                return info;
            }
        }

        state.setRequestCount(state.getRequestCount() + 1);
        state.setUpdatedAt(now);
        identifierAttemptRepository.saveAndFlush(state);
        Instant retryAt = retryAt(state.getRequestCount(), now);
        LoginLockoutInfo info = infoOf(null, true, safeIdentifier(reference), state.getRequestCount(), retryAt);
        recordFailureEvents(null, safeIdentifier(reference), info, ipAddress, userAgent);
        return info;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public LoginLockoutInfo finalizeSuccessfulLogin(String email, String ipAddress) {
        User user = userRepository.findByEmailAndDeletedFalseForUpdate(email).orElse(null);
        if (user == null) return null;
        if (user.isAccountLocked()) return infoOf(user, false, user.getEmail());
        user.setLastLoginAt(LocalDateTime.now(ZoneOffset.UTC));
        user.setLastLoginIp(ipAddress);
        user.resetFailedAttempts();
        userRepository.save(user);
        return null;
    }

    public void logBlockedAttempt(String email, LoginLockoutInfo info, String ipAddress, String userAgent) {
        User user = userRepository.findByEmailAndDeletedFalse(email).orElse(null);
        String identifier = user != null ? user.getEmail() : info.getIdentifierReference();
        recordBlockedEvents(user, identifier, info, ipAddress, userAgent);
    }

    private void recordBlockedEvents(User user, String identifier, LoginLockoutInfo info,
                                     String ipAddress, String userAgent) {
        auditService.logWithSeverity(user, "LOGIN_BLOCKED", "AUTH", "User",
                user != null ? user.getId().toString() : null,
                "Login blocked by active temporary restriction for " + identifier,
                ipAddress, AuditSeverity.CRITICAL);
        securityAuditService.logLoginAttemptAsync(identifier,
                user != null ? user.getId().toString() : null,
                ipAddress, "BLOCKED", "ACTIVE_ACCOUNT_RESTRICTION", userAgent);
    }

    private void recordFailureEvents(User user, String identifier, LoginLockoutInfo info,
                                     String ipAddress, String userAgent) {
        int attempts = info.getFailedAttempts();
        auditService.logWithSeverity(user, "LOGIN_FAILED", "AUTH", "User",
                user != null ? user.getId().toString() : null,
                "Failed login attempt " + attempts + " for " + identifier,
                ipAddress, AuditSeverity.WARNING);
        securityAuditService.logLoginAttemptAsync(identifier,
                user != null ? user.getId().toString() : null,
                ipAddress, "FAILED", "INVALID_CREDENTIALS", userAgent);

        if (attempts == 5 || (attempts >= 8 && attempts % 3 == 2)) {
            securityAuditService.createSecurityAlert(
                    "Repeated unsuccessful login attempts",
                    "Temporary restriction escalated after " + attempts + " failed attempts for " + identifier,
                    RiskLevel.HIGH, "ACCOUNT_LOCKOUT", ipAddress,
                    user != null ? user.getId().toString() : null);
        }
    }

    private long lockDurationFor(int attempt) {
        if (attempt <= 2) return 0;
        List<Long> durations = Arrays.stream(lockDurations.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).map(Long::parseLong).toList();
        if (durations.isEmpty()) return 30;
        return durations.get(Math.min(attempt - 3, durations.size() - 1));
    }

    private Instant retryAt(int attempts, Instant startedAt) {
        long duration = lockDurationFor(attempts);
        return duration > 0 ? startedAt.plusSeconds(duration) : null;
    }

    private LoginLockoutInfo infoOf(User user, boolean counted, String identifier) {
        Instant retryAt = user.getLockedUntil() == null ? null
                : user.getLockedUntil().toInstant(ZoneOffset.UTC);
        return infoOf(user, counted, identifier, user.getFailedLoginAttempts(), retryAt);
    }

    private LoginLockoutInfo infoOf(User user, boolean counted, String identifier, int attempts, Instant retryAt) {
        long seconds = retryAt == null ? 0
                : Math.max(0, (long) Math.ceil(Duration.between(Instant.now(), retryAt).toMillis() / 1000.0));
        return LoginLockoutInfo.builder()
                .failedAttempts(attempts)
                .accountExists(user != null)
                .counted(counted)
                .identifierReference(identifier)
                .lockSecondsRemaining(seconds)
                .retryAt(retryAt)
                .build();
    }

    private boolean isExpired(LoginIdentifierAttempt state) {
        return state.getUpdatedAt().isBefore(Instant.now().minus(UNKNOWN_STATE_TTL));
    }

    private void lockUnknownIdentifier(String key) {
        // H2 is used only by tests. Production PostgreSQL uses a transaction-
        // scoped advisory lock so even the first insert is atomic across nodes.
        if (!environment.acceptsProfiles(Profiles.of("test"))) {
            entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(hashtext(:key))")
                    .setParameter("key", key)
                    .getSingleResult();
        }
    }

    private String unknownKey(String reference) {
        return "auth-unknown:" + reference;
    }

    private String safeIdentifier(String reference) {
        return "unknown:" + reference.substring(0, Math.min(16, reference.length()));
    }

    private String identifierReference(String email) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(identifierHmacSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(email.trim().toLowerCase(Locale.ROOT)
                    .getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to create login identifier reference", ex);
        }
    }
}
