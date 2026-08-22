package com.photonicomega.facilities.module.security.dto;

import java.time.Instant;
import java.util.List;

/**
 * A single threat vector (one source IP) aggregated from real security data.
 *
 * <p>{@link #ip()} is ALWAYS the masked form (e.g. {@code 136.158.xxx.xxx});
 * the raw address is used internally only. Coordinates are {@code null} when
 * geolocation could not resolve the IP (frontend renders "Location: Unknown"
 * and explains that geographic mapping requires a public IP).
 *
 * <p>IP geolocation is approximate - it identifies the ISP/network location or
 * a nearby metropolitan area, not the user's exact physical location. When the
 * provider returns {@link #accuracyRadiusKm()} or {@link #confidence()}, the UI
 * must surface them.
 *
 * @param ip               masked source IP
 * @param country          country name, or {@code null} when unresolved
 * @param countryCode      ISO 3166-1 alpha-2 code, or {@code null}
 * @param region           region/subdivision name, or {@code null}
 * @param city             city name, or {@code null} when unresolved
 * @param latitude         WGS-84 latitude, or {@code null}
 * @param longitude        WGS-84 longitude, or {@code null}
 * @param timezone         IANA timezone, or {@code null}
 * @param isp              ISP / organization, or {@code null}
 * @param asn              autonomous system number, or {@code null}
 * @param accuracyRadiusKm approximate radius around the coordinates (km), or {@code null}
 * @param confidence       provider confidence, or {@code null}
 * @param ipVersion        resolved IP version (4 or 6)
 * @param privateIp        true when the source is a LOCAL / PRIVATE address (never geolocated)
 * @param threatTypes      breakdown of each threat type with event counts
 * @param primaryThreat    most severe {@link ThreatType} for coloring/marking
 * @param severity         overall severity (LOW/MEDIUM/HIGH/CRITICAL)
 * @param eventCount       total security events attributed to this IP in window
 * @param status           BLOCKED when an active block exists, else DETECTED
 * @param firstSeen        earliest event timestamp in the window
 * @param lastSeen         latest event timestamp in the window
 * @param source           data source (security_logs / login_history / blocked_ips)
 */
public record IpThreatEntry(
        String ip,
        String country,
        String countryCode,
        String region,
        String city,
        Double latitude,
        Double longitude,
        String timezone,
        String isp,
        String asn,
        Double accuracyRadiusKm,
        Double confidence,
        int ipVersion,
        boolean privateIp,
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