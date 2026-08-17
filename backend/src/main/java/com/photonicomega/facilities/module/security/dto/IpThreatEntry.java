package com.photonicomega.facilities.module.security.dto;

import java.time.Instant;
import java.util.List;

/**
 * A single threat vector (one source IP) aggregated from real security data.
 *
 * <p>{@link #ip()} is ALWAYS the masked form (e.g. {@code 136.158.xxx.xxx});
 * the raw address is used internally only. Coordinates are {@code null} when
 * geolocation could not resolve the IP (frontend renders "Location: Unknown").
 *
 * @param ip              masked source IP
 * @param country         country name, or {@code null} when unresolved
 * @param city            city name, or {@code null} when unresolved
 * @param latitude        WGS-84 latitude, or {@code null}
 * @param longitude       WGS-84 longitude, or {@code null}
 * @param threatTypes     breakdown of each threat type with event counts
 * @param primaryThreat   most severe {@link ThreatType} for coloring/marking
 * @param severity        overall severity (LOW/MEDIUM/HIGH/CRITICAL)
 * @param eventCount      total security events attributed to this IP in window
 * @param status          BLOCKED when an active block exists, else DETECTED
 * @param firstSeen       earliest event timestamp in the window
 * @param lastSeen        latest event timestamp in the window
 * @param source          data source (security_logs / login_history / blocked_ips)
 */
public record IpThreatEntry(
        String ip,
        String country,
        String city,
        Double latitude,
        Double longitude,
        List<ThreatTypeCount> threatTypes,
        ThreatType primaryThreat,
        String severity,
        long eventCount,
        String status,
        Instant firstSeen,
        Instant lastSeen,
        String source) {

    public record ThreatTypeCount(ThreatType type, long count) {
    }
}