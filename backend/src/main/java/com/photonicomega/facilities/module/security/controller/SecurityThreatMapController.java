package com.photonicomega.facilities.module.security.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.domain.SecurityModule;
import com.photonicomega.facilities.module.security.dto.ThreatMapResponse;
import com.photonicomega.facilities.module.security.dto.ThreatMapStats;
import com.photonicomega.facilities.module.security.dto.ThreatWindow;
import com.photonicomega.facilities.module.security.service.SecurityAuditService;
import com.photonicomega.facilities.module.security.service.SecurityThreatBroadcastService;
import com.photonicomega.facilities.module.security.service.SecurityThreatMapService;
import com.photonicomega.facilities.module.security.service.geo.IpGeo;
import com.photonicomega.facilities.module.security.service.geo.IpGeolocationService;
import com.photonicomega.facilities.module.security.util.ClientIpResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Endpoints for the Geographic IP Threat Vector Map & real-time telemetry.
 *
 * <p>Both map data and statistics are computed from the real security tables
 * ({@code security_logs}, {@code login_history}, {@code blocked_ips},
 * {@code active_sessions}) via {@link SecurityThreatMapService}, for the
 * selected time window. IPs are masked server-side.
 *
 * <p>{@code /v1/security/**} is SUPER_ADMIN-only (see SecurityConfig), so the
 * test-event and diagnostics endpoints below are safe to expose.
 */
@RestController
@RequestMapping("/v1/security/ip-threats")
@Tag(name = "IP Threat Vector Map", description = "Endpoints for Geographic IP Threat Visualization & Real-time Telemetry.")
@RequiredArgsConstructor
public class SecurityThreatMapController {

    private final SecurityThreatMapService threatMapService;
    private final SecurityThreatBroadcastService broadcastService;
    private final SecurityAuditService securityAuditService;
    private final IpGeolocationService ipGeolocationService;

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    @GetMapping("/vector-map")
    @Operation(summary = "Get Geographic IP Threat Vector Map locations from security database")
    public ResponseEntity<ApiResponse<ThreatMapResponse>> getVectorMapData(
            @RequestParam(name = "window", defaultValue = "24h") String window) {
        ThreatWindow selected = ThreatWindow.fromCode(window);
        return ResponseEntity.ok(ApiResponse.success(threatMapService.buildMap(selected)));
    }

    @GetMapping("/stats")
    @Operation(summary = "Get Geographic IP Threat Map summary statistics from database")
    public ResponseEntity<ApiResponse<ThreatMapStats>> getMapStats(
            @RequestParam(name = "window", defaultValue = "24h") String window) {
        ThreatWindow selected = ThreatWindow.fromCode(window);
        return ResponseEntity.ok(ApiResponse.success(threatMapService.buildStats(selected)));
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "SSE real-time stream of security threat events")
    public SseEmitter streamThreatEvents() {
        SseEmitter emitter = new SseEmitter(600_000L);
        this.emitters.add(emitter);

        emitter.onCompletion(() -> this.emitters.remove(emitter));
        emitter.onTimeout(() -> this.emitters.remove(emitter));
        emitter.onError(e -> this.emitters.remove(emitter));

        return emitter;
    }

    /**
     * Admin test function: writes a real security log row (and broadcasts an
     * immediate EVENT) so the full pipeline - DB -> STOMP -> map marker - can be
     * verified end-to-end without waiting for real traffic. The log is genuine
     * security data persisted through the normal audit service; no coordinates
     * are fabricated (geolocation is resolved from the caller's IP).
     */
    @PostMapping("/test-event")
    @Operation(summary = "Admin test function: persist a real security event and broadcast it live")
    public ResponseEntity<ApiResponse<Map<String, Object>>> triggerTestEvent(HttpServletRequest request) {
        String ip = ClientIpResolver.resolve(request).ip();

        SecurityLog log = SecurityLog.builder()
                .timestamp(Instant.now())
                .username("security-console")
                .role("SUPER_ADMIN")
                .ipAddress(ip)
                .deviceName("Security Console")
                .browser("API")
                .operatingSystem("API")
                .sessionId("test-event")
                .requestId(java.util.UUID.randomUUID().toString())
                .apiEndpoint("/v1/security/ip-threats/test-event")
                .httpMethod("POST")
                .action("TEST_EVENT")
                .module(SecurityModule.ADMIN_OPERATIONS)
                .status("SUCCESS")
                .reason("Admin-triggered test security event from the Security Console")
                .riskLevel(RiskLevel.MEDIUM)
                .build();

        securityAuditService.logSecurityEventAsync(log);
        broadcastService.broadcastTestEvent(log);

        Optional<IpGeo> geo = ipGeolocationService.geolocate(ip);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("eventId", log.getId());
        body.put("ip", com.photonicomega.facilities.module.security.util.IpMask.maskIp(ip));
        body.put("privateIp", ClientIpResolver.isPrivateOrLocal(ip));
        if (geo.isPresent()) {
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("country", geo.get().country());
            g.put("countryCode", geo.get().countryCode());
            g.put("city", geo.get().city());
            g.put("latitude", geo.get().latitude());
            g.put("longitude", geo.get().longitude());
            g.put("isp", geo.get().isp());
            g.put("asn", geo.get().asn());
            body.put("geolocation", g);
        } else {
            body.put("geolocation", null);
        }
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    /**
     * Diagnostics endpoint used by the console's Debug panel: shows how this
     * server sees the caller's IP, the geolocation provider state, and the
     * current pipeline configuration. No secrets are exposed.
     */
    @GetMapping("/diagnostics")
    @Operation(summary = "Pipeline diagnostics for the real-time threat map")
    public ResponseEntity<ApiResponse<Map<String, Object>>> diagnostics(HttpServletRequest request) {
        ClientIpResolver.ResolvedIp resolved = ClientIpResolver.resolve(request);
        Optional<IpGeo> geo = ipGeolocationService.geolocate(resolved.ip());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("clientIp", resolved.ip());
        body.put("ipVersion", resolved.ipVersion());
        body.put("privateIp", resolved.isPrivate());
        body.put("geoProvider", "ip-api.com");
        body.put("geoResolved", geo.map(IpGeo::resolved).orElse(false));
        if (geo.isPresent()) {
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("country", geo.get().country());
            g.put("countryCode", geo.get().countryCode());
            g.put("region", geo.get().region());
            g.put("city", geo.get().city());
            g.put("latitude", geo.get().latitude());
            g.put("longitude", geo.get().longitude());
            g.put("timezone", geo.get().timezone());
            g.put("isp", geo.get().isp());
            g.put("asn", geo.get().asn());
            g.put("accuracyRadiusKm", geo.get().accuracyRadiusKm());
            g.put("confidence", geo.get().confidence());
            body.put("geolocation", g);
        } else {
            body.put("geolocation", null);
        }
        body.put("broadcastWindow", SecurityThreatBroadcastService.BROADCAST_WINDOW.getCode());
        body.put("trustedHeaderChain", "X-Forwarded-For -> X-Real-IP -> remoteAddr (forwarded headers honored only behind loopback/private proxy)");
        return ResponseEntity.ok(ApiResponse.success(body));
    }
}