package com.photonicomega.facilities.module.security.dto;

/**
 * Summary statistics for the geographic IP threat map.
 *
 * @param totalThreatIps      number of distinct threat source IPs in window
 * @param detectedLast24h     threat IPs first seen within the last 24 hours
 * @param countriesAffected   distinct countries among resolvable threat IPs
 * @param blockedIps          currently ACTIVE blocked IPs
 * @param activeSessions      currently ACTIVE sessions (trusted)
 * @param failedLoginAttempts failed login events in the window
 */
public record ThreatMapStats(
        long totalThreatIps,
        long detectedLast24h,
        long countriesAffected,
        long blockedIps,
        long activeSessions,
        long failedLoginAttempts) {
}