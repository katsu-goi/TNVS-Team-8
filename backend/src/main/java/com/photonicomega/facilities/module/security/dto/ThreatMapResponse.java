package com.photonicomega.facilities.module.security.dto;

import java.time.Instant;
import java.util.List;

/**
 * Full response for {@code GET /v1/security/ip-threats/vector-map?window=}.
 *
 * @param window           applied {@link ThreatWindow} code
 * @param generatedAt      server-side generation timestamp
 * @param threats          aggregated threat vectors (masked IPs)
 * @param trustedSessions  active sessions rendered as trusted (green) markers
 * @param stats            summary statistics
 * @param recentLogs       most recent gateway events for the initial feed
 */
public record ThreatMapResponse(
        String window,
        Instant generatedAt,
        List<IpThreatEntry> threats,
        List<TrustedSessionEntry> trustedSessions,
        ThreatMapStats stats,
        List<GatewayLogEntry> recentLogs) {
}