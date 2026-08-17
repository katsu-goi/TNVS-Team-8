package com.photonicomega.facilities.module.security.dto;

import java.time.Instant;
import java.util.List;

/**
 * Envelope broadcast to {@code /topic/security/threats}.
 *
 * <p>Two shapes are sent:
 * <ul>
 *   <li><b>EVENT</b> (~every 5s when new data exists): {@code type=EVENT} with a
 *       single {@code threat} plus the triggering {@code log} and current
 *       {@code stats}.</li>
 *   <li><b>SYNC</b> (~every 30s): full {@code threats}, {@code trustedSessions}
 *       and {@code stats} snapshot so clients converge after reconnect.</li>
 * </ul>
 *
 * @param type            EVENT or SYNC
 * @param threat          EVENT-only: the affected threat vector
 * @param log             EVENT-only: the triggering gateway event
 * @param threats         SYNC-only: all aggregated threat vectors
 * @param trustedSessions SYNC-only: active sessions
 * @param stats           current summary statistics
 * @param timestamp       broadcast time
 */
public record SecurityThreatEvent(
        String type,
        IpThreatEntry threat,
        GatewayLogEntry log,
        List<IpThreatEntry> threats,
        List<TrustedSessionEntry> trustedSessions,
        ThreatMapStats stats,
        Instant timestamp) {

    public static final String TYPE_EVENT = "EVENT";
    public static final String TYPE_SYNC = "SYNC";
}