package com.photonicomega.facilities.module.monitoring.dto;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;

/**
 * Consolidated real-time telemetry for the six subsystems surfaced on the
 * System Subsystem Health & Availability Monitoring dashboard.
 *
 * <p>Every value is computed from live backend sources (database queries,
 * persisted security/audit logs, the Hikari connection pool, and the STOMP
 * outbound stream) - no mock, random, or frontend-generated metric exists
 * anywhere in this payload.
 */
public class SubsystemHealthSnapshot {

    public static final String STATUS_HEALTHY = "HEALTHY";
    public static final String STATUS_WARNING = "WARNING";
    public static final String STATUS_OFFLINE = "OFFLINE";
    public static final String STATUS_ERROR = "ERROR";

    public static final String OVERALL_OPERATIONAL = "OPERATIONAL";
    public static final String OVERALL_DEGRADED = "DEGRADED";
    public static final String OVERALL_OFFLINE = "OFFLINE";

    public static final String CHECK_PASS = "PASS";
    public static final String CHECK_WARN = "WARN";
    public static final String CHECK_FAIL = "FAIL";

    @Data
    @Builder
    public static class Snapshot {
        private List<SubsystemHealth> subsystems;
        private String overallStatus;
        private int healthyCount;
        private int warningCount;
        private int offlineCount;
        private int errorCount;
        private Instant timestamp;
    }

    @Data
    @Builder
    public static class SubsystemHealth {
        private String id;
        private String key;
        private String name;
        private String status;
        private double uptimePercent;
        private long errorCount;
        private Instant lastSync;
        private long latencyAvgMs;
        private long latencyPeakMs;
        private int dbPoolActive;
        private int dbPoolMax;
        private int dbPoolUtilizationPct;
        private int wsMessageLoadPct;
        private List<HealthCheck> checks;
        private List<Metric> metrics;
        private List<LogEntry> logs;

        // Chart series - only the series relevant to the subsystem are populated.
        private List<LatencyPoint> latencySeries;
        private List<ScannerPoint> scannerSeries;
        private List<ServicePoint> servicesSeries;
        private List<HeatPoint> heatmap;
        private List<Slice> vault;
        private List<BackupPoint> backupSyncSeries;
        private List<RatePoint> archivingSeries;
        private List<ModuleAction> ruleEnforcement;
        private List<RetentionPeriod> retentionPeriods;
        private List<JobPoint> scheduledJobs;
        private List<ResolutionPoint> caseResolution;
        private List<SlaPoint> courtSlaSeries;
        private List<Gauge> gauges;
        private List<PipelinePoint> renewalPipeline;
        private List<Slice> vendorDist;
    }

    @Data
    @Builder
    public static class HealthCheck {
        private String name;
        private String status;
        private String detail;
    }

    @Data
    @Builder
    public static class Metric {
        private String label;
        private String value;
        private String sub;
    }

    @Data
    @Builder
    public static class LogEntry {
        private String time;
        private String level;
        private String message;
    }

    @Data
    @Builder
    public static class LatencyPoint {
        private String time;
        private long api1;
        private long api2;
        private long api3;
    }

    @Data
    @Builder
    public static class ScannerPoint {
        private String type;
        private long avgMs;
        private long count;
    }

    @Data
    @Builder
    public static class ServicePoint {
        private String time;
        private double serviceA;
        private double serviceB;
        private double serviceC;
    }

    @Data
    @Builder
    public static class HeatPoint {
        private String location;
        private List<Integer> cells;
        private String status;
    }

    @Data
    @Builder
    public static class Slice {
        private String name;
        private long value;
        private String color;
    }

    @Data
    @Builder
    public static class BackupPoint {
        private String day;
        private long latencyMs;
    }

    @Data
    @Builder
    public static class RatePoint {
        private String module;
        private long rate;
    }

    @Data
    @Builder
    public static class ModuleAction {
        private String module;
        private long actions;
    }

    @Data
    @Builder
    public static class RetentionPeriod {
        private String name;
        private int periodDays;
    }

    @Data
    @Builder
    public static class JobPoint {
        private String hour;
        private long success;
        private long failed;
    }

    @Data
    @Builder
    public static class ResolutionPoint {
        private String type;
        private double days;
    }

    @Data
    @Builder
    public static class SlaPoint {
        private String period;
        private double sla;
    }

    @Data
    @Builder
    public static class Gauge {
        private String label;
        private String value;
        private double pct;
    }

    @Data
    @Builder
    public static class PipelinePoint {
        private String period;
        private long active;
        private long expiring;
    }
}