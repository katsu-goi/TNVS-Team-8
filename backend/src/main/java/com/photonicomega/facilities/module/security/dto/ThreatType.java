package com.photonicomega.facilities.module.security.dto;

/**
 * Classification of a threat vector shown on the geographic IP threat map.
 *
 * <p>Derived from real security data ({@code security_logs},
 * {@code login_history}, {@code blocked_ips}) using a deterministic mapping:
 * <ul>
 *   <li>{@code LOGIN_FAILED}/{@code status=FAILED} → {@link #FAILED_LOGIN}</li>
 *   <li>{@code ACCOUNT_LOCKED}/{@code status=LOCKED} → {@link #ACCOUNT_LOCKED}</li>
 *   <li>{@code SUSPICIOUS_REQUEST_BLOCKED} + SQLi reason → {@link #SQL_INJECTION}</li>
 *   <li>{@code SUSPICIOUS_REQUEST_BLOCKED} + XSS reason → {@link #XSS}</li>
 *   <li>{@code SUSPICIOUS_REQUEST_BLOCKED} + scanning/traversal → {@link #PORT_SCAN}</li>
 *   <li>{@code RATE_LIMIT_EXCEEDED} / 429 → {@link #RATE_LIMIT}</li>
 *   <li>ACTIVE {@code blocked_ips} row → {@link #BLOCKED_IP}</li>
 * </ul>
 */
public enum ThreatType {
    FAILED_LOGIN,
    ACCOUNT_LOCKED,
    SQL_INJECTION,
    XSS,
    PORT_SCAN,
    RATE_LIMIT,
    BLOCKED_IP,
    TRUSTED
}