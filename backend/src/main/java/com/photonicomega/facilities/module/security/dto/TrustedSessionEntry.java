package com.photonicomega.facilities.module.security.dto;

import java.time.Instant;

/**
 * A currently active (trusted) session rendered as a green marker on the map.
 * Trusted sessions are tracked separately from threats and never inflate the
 * {@code totalThreatIps} count.
 *
 * <p>IP geolocation is approximate - it identifies the ISP/network location or
 * a nearby metropolitan area, not the user's exact physical location. When the
 * provider returns {@link #accuracyRadiusKm()} or {@link #confidence()}, the UI
 * must surface them.
 *
 * @param sessionId        session id
 * @param username         authenticated user
 * @param role             user role
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
 * @param privateIp        true when the IP is LOCAL / PRIVATE (never geolocated)
 * @param loginTime        session login timestamp
 * @param lastActivity     last activity timestamp
 */
public record TrustedSessionEntry(
        String sessionId,
        String username,
        String role,
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
        Instant loginTime,
        Instant lastActivity) {
}