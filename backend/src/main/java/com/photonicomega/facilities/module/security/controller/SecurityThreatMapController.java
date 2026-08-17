package com.photonicomega.facilities.module.security.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.security.dto.ThreatMapResponse;
import com.photonicomega.facilities.module.security.dto.ThreatMapStats;
import com.photonicomega.facilities.module.security.dto.ThreatWindow;
import com.photonicomega.facilities.module.security.service.SecurityThreatMapService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Endpoints for the Geographic IP Threat Vector Map & real-time telemetry.
 *
 * <p>Both map data and statistics are computed from the real security tables
 * ({@code security_logs}, {@code login_history}, {@code blocked_ips},
 * {@code active_sessions}) via {@link SecurityThreatMapService}, for the
 * selected time window. IPs are masked server-side.
 */
@RestController
@RequestMapping("/v1/security/ip-threats")
@Tag(name = "IP Threat Vector Map", description = "Endpoints for Geographic IP Threat Visualization & Real-time Telemetry.")
@RequiredArgsConstructor
public class SecurityThreatMapController {

    private final SecurityThreatMapService threatMapService;

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
}