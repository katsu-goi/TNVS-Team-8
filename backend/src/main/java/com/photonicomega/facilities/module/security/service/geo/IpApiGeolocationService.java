package com.photonicomega.facilities.module.security.service.geo;

import com.fasterxml.jackson.databind.JsonNode;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * {@link IpGeolocationService} backed by the free {@code ip-api.com} HTTP API.
 *
 * <p>Lookups are cached in a dedicated Caffeine cache (TTL + max size from
 * {@link GeoProperties}) so the same IP is never re-queried on every map
 * render or STOMP tick. Private, loopback and link-local addresses are
 * short-circuited locally and always resolve to empty - ip-api rejects them
 * anyway ("reserved range") and there is no point paying a round trip.
 *
 * <p>Fully fail-open: every error path (timeout, rate limit, malformed
 * response, DNS failure) returns {@link Optional#empty()} so the security
 * map and event stream never break because of the geolocation provider.
 */
@Service
@Slf4j
public class IpApiGeolocationService implements IpGeolocationService {

    private final GeoProperties properties;
    private final RestClient restClient;
    private final Cache<String, Optional<IpGeo>> cache;

    public IpApiGeolocationService(GeoProperties properties) {
        this.properties = properties;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) properties.getTimeoutMs());
        requestFactory.setReadTimeout((int) properties.getTimeoutMs());
        this.restClient = RestClient.builder()
                .baseUrl(properties.getBaseUrl())
                .requestFactory(requestFactory)
                .build();
        this.cache = Caffeine.newBuilder()
                .maximumSize(properties.getCacheMaxSize())
                .expireAfterWrite(properties.getCacheTtlSeconds(), TimeUnit.SECONDS)
                .build();
    }

    @Override
    public Optional<IpGeo> peek(String ipAddress) {
        if (ipAddress == null || ipAddress.isBlank()) {
            return Optional.empty();
        }
        return cache.getIfPresent(ipAddress.trim());
    }

    @Override
    public Optional<IpGeo> geolocate(String ipAddress) {
        if (ipAddress == null || ipAddress.isBlank()) {
            return Optional.empty();
        }
        String ip = ipAddress.trim();
        if (isPrivateOrLocal(ip)) {
            return Optional.empty();
        }

        Optional<IpGeo> cached = cache.getIfPresent(ip);
        if (cached != null) {
            return cached;
        }

        Optional<IpGeo> resolved = lookup(ip);
        cache.put(ip, resolved);
        return resolved;
    }

    private Optional<IpGeo> lookup(String ip) {
        try {
            JsonNode node = restClient.get()
                    .uri("/{ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as,query,accuracy,reverse,proxy,hosting", ip)
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(JsonNode.class);

            if (node == null || !"success".equals(node.path("status").asText())) {
                log.debug("ip-api lookup failed for {}: {}",
                        ip, node != null ? node.path("message").asText() : "no response");
                return Optional.empty();
            }

            if (!node.hasNonNull("lat") || !node.hasNonNull("lon")) {
                return Optional.empty();
            }

            double lat = node.path("lat").asDouble();
            double lon = node.path("lon").asDouble();
            Double accuracy = node.hasNonNull("accuracy") ? node.path("accuracy").asDouble() : null;
            Double confidence = node.hasNonNull("confidence") ? node.path("confidence").asDouble() : null;

            IpGeo geo = new IpGeo(
                    lat,
                    lon,
                    node.path("country").asText(null),
                    node.path("countryCode").asText(null),
                    node.path("regionName").asText(null),
                    node.path("city").asText(null),
                    node.path("timezone").asText(null),
                    node.path("isp").asText(null),
                    node.path("as").asText(null),
                    accuracy,
                    confidence,
                    ip.contains(":") ? 6 : 4);
            log.debug("Geolocated {} -> {},{} ({}, {}) [{}]", ip, geo.latitude(), geo.longitude(),
                    geo.country(), geo.city(), geo.isp());
            return Optional.of(geo);
        } catch (Exception ex) {
            log.warn("Geolocation lookup failed for {} (fail-open): {}", ip, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * True for loopback, private (RFC 1918), link-local, CGNAT and IPv4-mapped
     * addresses that a public geolocation provider will never resolve. This is
     * a pragmatic pre-check only; genuinely unknown public IPs still go through
     * the provider and return empty when it cannot place them.
     */
    private boolean isPrivateOrLocal(String ip) {
        return com.photonicomega.facilities.module.security.util.ClientIpResolver.isPrivateOrLocal(ip);
    }
}