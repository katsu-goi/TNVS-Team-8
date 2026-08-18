package com.photonicomega.facilities.module.security.service.geo;

/**
 * Result of a geolocation lookup for a single IP address.
 *
 * <p>{@code null} coordinates indicate the location could not be resolved
 * (e.g. a private/loopback address, or the provider was unreachable). Callers
 * must fail open: treat an unresolved lookup as "location unknown" and never
 * let a geolocation failure block security event processing.
 *
 * <p>IP geolocation is approximate. It identifies the ISP/network location or
 * a nearby metropolitan area, not the user's exact physical location. When the
 * provider supplies {@link #accuracyRadiusKm()} and/or {@link #confidence()},
 * the UI must surface them so administrators do not over-interpret precision.
 *
 * @param latitude          WGS-84 latitude, or {@code null} when unknown
 * @param longitude         WGS-84 longitude, or {@code null} when unknown
 * @param country           country name, or {@code null} when unknown
 * @param countryCode       ISO 3166-1 alpha-2 code, or {@code null}
 * @param region            region/subdivision name, or {@code null}
 * @param city              city name, or {@code null} when unknown
 * @param timezone          IANA timezone, or {@code null}
 * @param isp               ISP / organization name, or {@code null}
 * @param asn               autonomous system number (e.g. {@code AS136168}), or {@code null}
 * @param accuracyRadiusKm  approximate radius (km) around the coordinates, or {@code null}
 * @param confidence        provider confidence (0..1 or 0..100), or {@code null}
 * @param ipVersion         resolved IP version (4 or 6)
 */
public record IpGeo(
        Double latitude,
        Double longitude,
        String country,
        String countryCode,
        String region,
        String city,
        String timezone,
        String isp,
        String asn,
        Double accuracyRadiusKm,
        Double confidence,
        int ipVersion) {

    public boolean resolved() {
        return latitude != null && longitude != null;
    }
}