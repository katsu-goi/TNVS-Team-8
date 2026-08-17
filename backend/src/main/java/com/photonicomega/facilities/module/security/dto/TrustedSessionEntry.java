package com.photonicomega.facilities.module.security.dto;

import java.time.Instant;

/**
 * A currently active (trusted) session rendered as a green marker on the map.
 * Trusted sessions are tracked separately from threats and never inflate the
 * {@code totalThreatIps} count.
 *
 * @param sessionId   session id
 * @param username    authenticated user
 * @param role        user role
 * @param ip          masked source IP
 * @param country     country name, or {@code null} when unresolved
 * @param city        city name, or {@code null} when unresolved
 * @param latitude    WGS-84 latitude, or {@code null}
 * @param longitude   WGS-84 longitude, or {@code null}
 * @param loginTime   session login timestamp
 * @param lastActivity last activity timestamp
 */
public record TrustedSessionEntry(
        String sessionId,
        String username,
        String role,
        String ip,
        String country,
        String city,
        Double latitude,
        Double longitude,
        Instant loginTime,
        Instant lastActivity) {
}