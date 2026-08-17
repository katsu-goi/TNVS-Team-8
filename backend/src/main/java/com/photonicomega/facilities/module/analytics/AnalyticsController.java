package com.photonicomega.facilities.module.analytics;

import com.photonicomega.facilities.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import static com.photonicomega.facilities.module.analytics.AnalyticsResponse.Response;

/**
 * Single aggregation endpoint for the System Administrator Analytics dashboard.
 *
 * <p>Every KPI, chart series, and insight is computed from real persisted data
 * (security logs, audit logs, login history, visitors, documents, contracts,
 * reservations, backups), the real in-memory AI request log, and the real-time
 * subsystem health snapshot. No mock or fabricated values are produced.
 */
@RestController
@RequestMapping("/v1/admin/analytics")
@RequiredArgsConstructor
@Tag(name = "Analytics", description = "Enterprise analytics aggregation for the System Administrator")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    @GetMapping
    @Operation(summary = "Get consolidated analytics for the selected period (SUPER_ADMIN)")
    public ResponseEntity<ApiResponse<Response>> getAnalytics(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {

        Instant end = to != null ? to : Instant.now();
        Instant start = from != null ? from : end.minus(Duration.ofDays(30));
        if (start.isAfter(end)) {
            start = end.minus(Duration.ofDays(30));
        }
        String label = periodLabel(start, end);

        Response response = analyticsService.buildAnalytics(start, end, label);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    private String periodLabel(Instant start, Instant end) {
        long hours = Duration.between(start, end).toHours();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("MMM d, yyyy HH:mm").withZone(ZoneOffset.UTC);
        if (hours <= 24) return "Last 24 Hours";
        if (hours <= 48) return "Last 48 Hours";
        if (hours <= 24 * 7) return "Last 7 Days";
        if (hours <= 24 * 30) return "Last 30 Days";
        if (hours <= 24 * 90) return "Last 90 Days";
        return fmt.format(start) + " - " + fmt.format(end);
    }
}