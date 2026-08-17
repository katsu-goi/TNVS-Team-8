package com.photonicomega.facilities.module.security.service.geo;

import java.util.Optional;

/**
 * Resolves the geographic origin of an IP address.
 *
 * <p>Implementations MUST fail open: they return {@link Optional#empty()} for
 * private/loopback addresses, rate-limited responses, timeouts or any other
 * error. Callers must never propagate a geolocation exception, because the
 * IP threat map must keep working even when the external provider is down.
 */
public interface IpGeolocationService {

    /**
     * Looks up the location for the given IP address.
     *
     * @param ipAddress the IPv4/IPv6 address to resolve
     * @return the resolved location, or {@link Optional#empty()} when unknown
     */
    Optional<IpGeo> geolocate(String ipAddress);
}