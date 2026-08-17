package com.photonicomega.facilities.module.security.dto;

import java.time.Duration;
import java.time.temporal.ChronoUnit;

/**
 * Time window for the IP threat map aggregation. All windows are computed
 * against UTC {@code Instant}s stored in the database.
 */
public enum ThreatWindow {

    /** Last 15 minutes. */
    MINUTES_15("15m", Duration.of(15, ChronoUnit.MINUTES)),
    /** Last 1 hour. */
    HOURS_1("1h", Duration.ofHours(1)),
    /** Last 24 hours (default). */
    HOURS_24("24h", Duration.ofHours(24)),
    /** Last 7 days. */
    DAYS_7("7d", Duration.ofDays(7));

    private final String code;
    private final Duration duration;

    ThreatWindow(String code, Duration duration) {
        this.code = code;
        this.duration = duration;
    }

    public String getCode() {
        return code;
    }

    public Duration getDuration() {
        return duration;
    }

    /** Parses a {@code window} query parameter; defaults to {@link #HOURS_24}. */
    public static ThreatWindow fromCode(String code) {
        if (code == null || code.isBlank()) {
            return HOURS_24;
        }
        for (ThreatWindow window : values()) {
            if (window.code.equalsIgnoreCase(code.trim())) {
                return window;
            }
        }
        return HOURS_24;
    }
}