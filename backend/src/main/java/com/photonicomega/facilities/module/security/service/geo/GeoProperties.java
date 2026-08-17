package com.photonicomega.facilities.module.security.service.geo;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Externalized configuration for the geographic IP lookup provider.
 *
 * <p>All values are overridable via environment variables (see
 * {@code application.yml} {@code app.geo.*}) so no deployment (staging,
 * Vercel, tunnel) ever needs to bake in a hardcoded URL or timeout.
 *
 * <p>Defaults target the free {@code ip-api.com} HTTP endpoint, which accepts
 * {@code http://ip-api.com/json/{ip}?fields=status,country,city,lat,lon}.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app.geo")
public class GeoProperties {

    /** Provider name (informational; currently {@code ip-api}). */
    private String provider = "ip-api";

    /** Base URL of the lookup provider. */
    private String baseUrl = "http://ip-api.com/json";

    /** Per-request timeout in milliseconds. */
    private long timeoutMs = 2000;

    /** How long a resolved location stays in the Caffeine cache, in seconds. */
    private long cacheTtlSeconds = 86400;

    /** Maximum number of cached geolocation entries. */
    private long cacheMaxSize = 10000;
}