package com.photonicomega.facilities.module.security.dto;

import java.time.Instant;
import java.util.List;

/**
 * Envelope broadcast to {@code /topic/security/threats}.
 *
 * <p>Two shapes are sent:
 * <ul>
 *   <li><b>EVENT</b> (~every 5s when new data exists): {@code type=EVENT} with a
 *       single {@code threat} plus the triggering {@code log}, an optional
 *       {@code trustedSession} (present when the triggering log is a successful
 *       login with an active session) and current {@code stats}. The
 *       {@code window} field echoes the aggregation window used to build the
 *       event so the client can ignore mismatched data.</li>
 *   <li><b>SYNC</b> (~every 30s): full {@code threats}, {@code trustedSessions}
 *       and {@code stats} snapshot plus the {@code window} used, so clients
 *       converge after reconnect.</li>
 * </ul>
 *
 * @param type            EVENT or SYNC
 * @param window          aggregation window (e.g. "1h"/"24h"/"7d")
 * @param threat          EVENT-only: the affected threat vector
 * @param log             EVENT-only: the triggering gateway event
 * @param trustedSession  EVENT-only: active trusted session for a successful login
 * @param threats         SYNC-only: all aggregated threat vectors
 * @param trustedSessions SYNC-only: active sessions
 * @param stats           current summary statistics
 * @param timestamp       broadcast time
 */
public record SecurityThreatEvent(
        String type,
        String window,
        IpThreatEntry threat,
        GatewayLogEntry log,
        TrustedSessionEntry trustedSession,
        List<IpThreatEntry> threats,
        List<TrustedSessionEntry> trustedSessions,
        ThreatMapStats stats,
        Instant timestamp) {

    public static final String TYPE_EVENT = "EVENT";
    public static final String TYPE_SYNC = "SYNC";
}
