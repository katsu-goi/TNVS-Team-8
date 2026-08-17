package com.photonicomega.facilities.module.analytics;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;

/**
 * Consolidated analytics for the System Administrator Analytics dashboard.
 *
 * <p>Every value is aggregated from persisted database rows or the real
 * in-memory AI request log - there is no mock, random, or fabricated data.
 * Where a previous-period comparison is impossible (no persisted history,
 * e.g. in-memory AI logs or the real-time health snapshot), the field is
 * left empty and the UI renders an empty state instead of a fake delta.
 */
public class AnalyticsResponse {

    @Data
    @Builder
    public static class Response {
        private PeriodInfo period;
        private List<Kpi> kpis;
        private ActivityOverview activity;
        private SecurityAnalytics security;
        private AiAnalytics ai;
        private SystemHealth health;
        private AuditAnalytics audit;
        private DocumentAnalytics documents;
        private ContractAnalytics contracts;
        private BackupAnalytics backups;
        private List<Insight> insights;
    }

    @Data
    @Builder
    public static class PeriodInfo {
        private Instant from;
        private Instant to;
        private String label;
    }

    @Data
    @Builder
    public static class Kpi {
        private String key;
        private String label;
        private String value;
        private String description;
        private Double previous;
        private Double deltaPct;
        private String trend;      // "up" | "down" | "flat" | null
        private String status;     // "good" | "warning" | "bad" | "neutral"
        private boolean hasComparison;
    }

    @Data
    @Builder
    public static class ActivityOverview {
        private List<String> labels;
        private List<Series> series;
    }

    @Data
    @Builder
    public static class Series {
        private String key;
        private String name;
        private String color;
        private List<Long> values;
    }

    @Data
    @Builder
    public static class SecurityAnalytics {
        private long total;
        private long critical;
        private long high;
        private long medium;
        private long low;
        private long failedLogins;
        private long blockedIps;
        private List<LabelValue> byRiskLevel;
        private List<LabelValue> overTime;
    }

    @Data
    @Builder
    public static class AiAnalytics {
        private long totalRequests;
        private long successful;
        private long failed;
        private Double successRate;
        private Long avgResponseTimeMs;
        private String source;     // "IN_MEMORY" - request logs are not persisted
        private List<Provider> providers;
        private List<LabelValue> requestsByProvider;
    }

    @Data
    @Builder
    public static class Provider {
        private String id;
        private String name;
        private String model;
        private String status;
        private String responseTime;
        private boolean isDefault;
        private String type;
    }

    @Data
    @Builder
    public static class SystemHealth {
        private String overallStatus;
        private int healthyCount;
        private int warningCount;
        private int offlineCount;
        private int errorCount;
        private List<Component> components;
    }

    @Data
    @Builder
    public static class Component {
        private String id;
        private String name;
        private String status;
        private double uptimePercent;
        private long errorCount;
    }

    @Data
    @Builder
    public static class AuditAnalytics {
        private long total;
        private List<LabelValue> byModule;
        private List<LabelValue> byAction;
        private String mostActiveModule;
        private String mostCommonAction;
    }

    @Data
    @Builder
    public static class DocumentAnalytics {
        private long total;
        private long uploaded;
        private long archived;
        private long aiClassified;
    }

    @Data
    @Builder
    public static class ContractAnalytics {
        private long total;
        private long active;
        private long expiringSoon;
        private long expired;
        private long renewed;
    }

    @Data
    @Builder
    public static class BackupAnalytics {
        private long total;
        private long successCount;
        private long failedCount;
        private Double successRate;
        private String lastSuccessfulAt;
        private String lastBackupAt;
    }

    @Data
    @Builder
    public static class Insight {
        private String severity;   // "info" | "good" | "warning" | "critical"
        private String title;
        private String description;
    }

    @Data
    @Builder
    public static class LabelValue {
        private String label;
        private long value;
    }
}