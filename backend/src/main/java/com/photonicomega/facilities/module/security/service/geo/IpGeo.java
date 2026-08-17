package com.photonicomega.facilities.module.security.service.geo;

/**
 * Result of a geolocation lookup for a single IP address.
 *
 * <p>{@code null} coordinates indicate the location could not be resolved
 * (e.g. a private/loopback address, or the provider was unreachable). Callers
 * must fail open: treat an unresolved lookup as "location unknown" and never
 * let a geolocation failure block security event processing.
 *
 * @param latitude  WGS-84 latitude, or {@code null} when unknown
 * @param longitude WGS-84 longitude, or {@code null} when unknown
 * @param country   Country name, or {@code null} when unknown
 * @param city      City name, or {@code null} when unknown
 */
public record IpGeo(Double latitude, Double longitude, String country, String city) {

    public boolean resolved() {
        return latitude != null && longitude != null;
    }
}