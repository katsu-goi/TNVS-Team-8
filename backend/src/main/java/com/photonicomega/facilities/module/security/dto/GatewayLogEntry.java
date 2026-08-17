package com.photonicomega.facilities.module.security.dto;

import java.time.Instant;

/**
 * A single gateway security event displayed in the real-time Gateway Logs feed.
 *
 * @param timestamp when the event occurred
 * @param action    event action (e.g. SUSPICIOUS_REQUEST_BLOCKED)
 * @param ip        masked source IP
 * @param severity  risk level (LOW/MEDIUM/HIGH/CRITICAL)
 * @param module    security module
 * @param status    outcome (BLOCKED/FAILED/SUCCESS)
 * @param reason    human-readable detail
 */
public record GatewayLogEntry(
        Instant timestamp,
        String action,
        String ip,
        String severity,
        String module,
        String status,
        String reason) {
}