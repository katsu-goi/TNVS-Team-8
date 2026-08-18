package com.photonicomega.facilities.module.security.dto;

import java.time.Instant;

/**
 * A single gateway security event displayed in the real-time Gateway Logs feed.
 *
 * <p>IP geolocation is approximate - it identifies the ISP/network location or
 * a nearby metropolitan area, not the user's exact physical location. When the
 * provider returns {@link #accuracyRadiusKm()} or {@link #confidence()}, the UI
 * must surface them.
 *
 * @param timestamp        when the event occurred
 * @param action           event action (e.g. SUSPICIOUS_REQUEST_BLOCKED)
 * @param ip               masked source IP
 * @param username         authenticated user, or {@code null} for anonymous
 * @param severity         risk level (LOW/MEDIUM/HIGH/CRITICAL)
 * @param module           security module
 * @param status           outcome (BLOCKED/FAILED/SUCCESS)
 * @param reason           human-readable detail
 * @param country          country name, or {@code null} when unresolved
 * @param countryCode      ISO 3166-1 alpha-2 code, or {@code null}
 * @param city             city name, or {@code null} when unresolved
 * @param privateIp        true when the IP is LOCAL / PRIVATE (never geolocated)
 * @param latitude         WGS-84 latitude, or {@code null}
 * @param longitude        WGS-84 longitude, or {@code null}
 * @param accuracyRadiusKm approximate radius around the coordinates (km), or {@code null}
 * @param confidence       provider confidence, or {@code null}
 * @param isp              ISP / organization, or {@code null}
 * @param asn              autonomous system number, or {@code null}
 */
public record GatewayLogEntry(
        Instant timestamp,
        String action,
        String ip,
        String username,
        String severity,
        String module,
        String status,
        String reason,
        String country,
        String countryCode,
        String city,
        boolean privateIp,
        Double latitude,
        Double longitude,
        Double accuracyRadiusKm,
        Double confidence,
        String isp,
        String asn) {
}
