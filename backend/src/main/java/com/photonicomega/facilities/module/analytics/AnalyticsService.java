package com.photonicomega.facilities.module.analytics;

import com.photonicomega.facilities.ai.AiStateManagementService;
import com.photonicomega.facilities.module.admin.repository.BackupRecordRepository;
import com.photonicomega.facilities.module.auth.repository.AuditLogRepository;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.facilities.repository.ReservationRepository;
import com.photonicomega.facilities.module.monitoring.dto.SubsystemHealthSnapshot;
import com.photonicomega.facilities.module.monitoring.service.SubsystemHealthMonitorService;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.repository.ActiveSessionRepository;
import com.photonicomega.facilities.module.security.repository.BlockedIpRepository;
import com.photonicomega.facilities.module.security.repository.LoginHistoryRepository;
import com.photonicomega.facilities.module.security.repository.SecurityLogRepository;
import com.photonicomega.facilities.module.visitor.repository.VisitorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static com.photonicomega.facilities.module.analytics.AnalyticsResponse.*;

/**
 * Aggregates the single-payload Analytics dashboard from real persisted data.
 *
 * <p>Sources:
 * <ul>
 *   <li>security_logs (SecurityLogRepository) - security events & event series</li>
 *   <li>login_history (LoginHistoryRepository) - failed logins</li>
 *   <li>audit_logs (AuditLogRepository) - audit activity by module/action</li>
 *   <li>visitors, documents, contracts, reservations - activity series & KPIs</li>
 *   <li>backup_records - backup success/failure analytics</li>
 *   <li>real in-memory AI request log (AiStateManagementService#getLogs) -
 *       AI performance. Request logs are NOT persisted, so AI metrics carry
 *       {@code source = IN_MEMORY} and never show a fabricated comparison.</li>
 *   <li>real-time subsystem health snapshot (SubsystemHealthMonitorService)</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final SecurityLogRepository securityLogRepository;
    private final LoginHistoryRepository loginHistoryRepository;
    private final AuditLogRepository auditLogRepository;
    private final VisitorRepository visitorRepository;
    private final DocumentRepository documentRepository;
    private final ContractRepository contractRepository;
    private final ReservationRepository reservationRepository;
    private final BackupRecordRepository backupRecordRepository;
    private final ActiveSessionRepository activeSessionRepository;
    private final BlockedIpRepository blockedIpRepository;
    private final AiStateManagementService aiStateService;
    private final SubsystemHealthMonitorService subsystemHealthMonitorService;

    private static final DateTimeFormatter HOUR_LABEL = DateTimeFormatter.ofPattern("MM-dd HH:00");
    private static final DateTimeFormatter DAY_LABEL = DateTimeFormatter.ofPattern("MM-dd");

    public Response buildAnalytics(Instant from, Instant to, String label) {
        List<String> labels = buildLabels(from, to);

        Response response = Response.builder()
                .period(PeriodInfo.builder().from(from).to(to).label(label).build())
                .kpis(buildKpis(from, to))
                .activity(buildActivity(from, to, labels))
                .security(buildSecurity(from, to, labels))
                .ai(buildAi())
                .health(buildHealth())
                .audit(buildAudit(from, to))
                .documents(buildDocuments(from, to))
                .contracts(buildContracts())
                .backups(buildBackups(from, to))
                .insights(buildInsights(from, to))
                .build();
        return response;
    }

    // ------------------------------------------------------------------
    // KPI cards (5-6) with previous-period comparison only when real
    // persisted history exists for both windows.
    // ------------------------------------------------------------------

    private List<Kpi> buildKpis(Instant from, Instant to) {
        long prevFromMs = Duration.between(from, to).toMillis();
        Instant prevTo = from;
        Instant prevFrom = prevTo.minusMillis(prevFromMs);

        List<Kpi> kpis = new ArrayList<>();

        long security = securityLogRepository.countByTimestampBetween(from, to);
        long securityPrev = securityLogRepository.countByTimestampBetween(prevFrom, prevTo);
        kpis.add(kpi("securityEvents", "Security Events", security, "Events in period",
                securityPrev, security > 0 ? "warning" : "neutral"));

        long audit = auditLogRepository.countByCreatedAtBetween(ldt(from), ldt(to));
        long auditPrev = auditLogRepository.countByCreatedAtBetween(ldt(prevFrom), ldt(prevTo));
        kpis.add(kpi("auditActivity", "Audit Activity", audit, "Audit trail entries",
                auditPrev, audit > 0 ? "neutral" : "neutral"));

        long failed = loginHistoryRepository.countByStatusAndTimestampBetween("FAILED", from, to);
        long failedPrev = loginHistoryRepository.countByStatusAndTimestampBetween("FAILED", prevFrom, prevTo);
        kpis.add(kpi("failedLogins", "Failed Logins", failed, "Login attempts rejected",
                failedPrev, failed > 0 ? "bad" : "good"));

        long errors = securityLogRepository.countByStatusAndTimestampBetween("FAILED", from, to);
        long errorsPrev = securityLogRepository.countByStatusAndTimestampBetween("FAILED", prevFrom, prevTo);
        kpis.add(kpi("systemErrors", "System Errors", errors, "Failed security/API events",
                errorsPrev, errors > 0 ? "bad" : "good"));

        // Active sessions: real-time, no persisted history -> no comparison.
        long activeSessions = activeSessionRepository.findByStatus("ACTIVE").size();
        kpis.add(kpi("activeSessions", "Active Sessions", activeSessions, "Users online now",
                null, activeSessions > 0 ? "good" : "neutral"));

        // System availability from the real-time snapshot (no history).
        SubsystemHealthSnapshot.Snapshot snapshot = subsystemHealthMonitorService.getLatestSnapshot();
        int components = snapshot != null ? snapshot.getSubsystems().size() : 0;
        int healthy = snapshot != null ? snapshot.getHealthyCount() : 0;
        double availability = components == 0 ? 0 : Math.round(healthy * 100.0 / components);
        kpis.add(Kpi.builder()
                .key("availability")
                .label("System Availability")
                .value(availability + "%")
                .description(healthy + " of " + components + " subsystems healthy")
                .previous(null).deltaPct(null).trend(null)
                .status(availability >= 80 ? "good" : availability >= 50 ? "warning" : "bad")
                .hasComparison(false)
                .build());

        return kpis;
    }

    private Kpi kpi(String key, String label, long current, String description, Long previous, String status) {
        boolean hasComparison = previous != null && previous > 0 && current > 0;
        Double delta = null;
        String trend = null;
        if (hasComparison && previous != null) {
            delta = Math.round((current - previous) * 1000.0 / previous) / 10.0;
            trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
        }
        return Kpi.builder()
                .key(key)
                .label(label)
                .value(String.valueOf(current))
                .description(description)
                .previous(hasComparison ? (double) previous : null)
                .deltaPct(delta)
                .trend(trend)
                .status(status)
                .hasComparison(hasComparison)
                .build();
    }

    // ------------------------------------------------------------------
    // System activity time-series
    // ------------------------------------------------------------------

    private ActivityOverview buildActivity(Instant from, Instant to, List<String> labels) {
        Map<String, long[]> buckets = new HashMap<>(); // key -> counts aligned to labels

        // Security events
        List<Long> security = bucketInstant(securityLogRepository.findByTimestampBetween(from, to)
                .stream().map(com.photonicomega.facilities.module.security.domain.SecurityLog::getTimestamp).toList(), from, to, labels);
        buckets.put("securityEvents", toLongArray(security));

        // Login attempts
        List<Long> logins = bucketInstant(loginHistoryRepository.findByTimestampBetween(from, to)
                .stream().map(com.photonicomega.facilities.module.security.domain.LoginHistory::getTimestamp).toList(), from, to, labels);
        buckets.put("logins", toLongArray(logins));

        // Audit events
        List<Long> audit = bucketLdt(auditLogRepository.findByCreatedAtBetween(ldt(from), ldt(to))
                .stream().map(com.photonicomega.facilities.module.auth.domain.AuditLog::getCreatedAt).toList(), ldt(from), ldt(to), labels);
        buckets.put("audit", toLongArray(audit));

        // Visitors
        List<Long> visitors = bucketLdt(visitorRepository.findByCreatedAtBetween(ldt(from), ldt(to))
                .stream().map(com.photonicomega.facilities.common.domain.BaseEntity::getCreatedAt).toList(), ldt(from), ldt(to), labels);
        buckets.put("visitors", toLongArray(visitors));

        // Documents
        List<Long> documents = bucketLdt(documentRepository.findByCreatedAtBetween(ldt(from), ldt(to))
                .stream().map(com.photonicomega.facilities.common.domain.BaseEntity::getCreatedAt).toList(), ldt(from), ldt(to), labels);
        buckets.put("documents", toLongArray(documents));

        // Contracts
        List<Long> contracts = bucketLdt(contractRepository.findByCreatedAtBetween(ldt(from), ldt(to))
                .stream().map(com.photonicomega.facilities.common.domain.BaseEntity::getCreatedAt).toList(), ldt(from), ldt(to), labels);
        buckets.put("contracts", toLongArray(contracts));

        // Reservations (by scheduled start time)
        List<Long> reservations = bucketLdt(reservationRepository.findByStartTimeBetween(ldt(from), ldt(to))
                .stream().map(com.photonicomega.facilities.module.facilities.domain.Reservation::getStartTime).toList(), ldt(from), ldt(to), labels);
        buckets.put("reservations", toLongArray(reservations));

        List<Series> series = List.of(
                series("securityEvents", "Security Events", "#ef4444", buckets.get("securityEvents")),
                series("logins", "Login Attempts", "#f59e0b", buckets.get("logins")),
                series("audit", "Audit Events", "#3b82f6", buckets.get("audit")),
                series("reservations", "Reservations", "#10b981", buckets.get("reservations")),
                series("visitors", "Visitors", "#8b5cf6", buckets.get("visitors")),
                series("documents", "Documents", "#06b6d4", buckets.get("documents")),
                series("contracts", "Contracts", "#64748b", buckets.get("contracts")));

        return ActivityOverview.builder().labels(labels).series(series).build();
    }

    private Series series(String key, String name, String color, long[] values) {
        return Series.builder()
                .key(key).name(name).color(color)
                .values(java.util.Arrays.stream(values).boxed().toList())
                .build();
    }

    private long[] toLongArray(List<Long> list) {
        long[] out = new long[list.size()];
        for (int i = 0; i < list.size(); i++) out[i] = list.get(i);
        return out;
    }

    private List<String> buildLabels(Instant from, Instant to) {
        boolean hourly = Duration.between(from, to).toHours() <= 48;
        List<String> labels = new ArrayList<>();
        if (hourly) {
            LocalDateTime cursor = ldt(from).withMinute(0).withSecond(0).withNano(0);
            LocalDateTime end = ldt(to);
            while (!cursor.isAfter(end)) {
                labels.add(cursor.format(HOUR_LABEL));
                cursor = cursor.plusHours(1);
            }
        } else {
            LocalDate cursor = ldt(from).toLocalDate();
            LocalDate end = ldt(to).toLocalDate();
            while (!cursor.isAfter(end)) {
                labels.add(cursor.format(DAY_LABEL));
                cursor = cursor.plusDays(1);
            }
        }
        return labels;
    }

    private List<Long> bucketInstant(List<Instant> items, Instant from, Instant to, List<String> labels) {
        return bucketTimestamps(items.stream().map(this::ldt).toList(), ldt(from), ldt(to), labels);
    }

    // Returns a count list aligned to labels for LocalDateTime items.
    private List<Long> bucketLdt(List<LocalDateTime> items, LocalDateTime from, LocalDateTime to, List<String> labels) {
        return bucketTimestamps(items, from, to, labels);
    }

    private List<Long> bucketTimestamps(List<LocalDateTime> items, LocalDateTime from, LocalDateTime to, List<String> labels) {
        boolean hourly = Duration.between(from, to).toHours() <= 48;
        long[] counts = new long[labels.size()];
        LocalDateTime bucketStart = hourly ? from.withMinute(0).withSecond(0).withNano(0) : from.toLocalDate().atStartOfDay();
        for (LocalDateTime item : items) {
            if (item == null) continue;
            int idx = labelIndex(item, bucketStart, hourly);
            if (idx >= 0 && idx < counts.length) counts[idx]++;
        }
        return box(counts);
    }

    private List<Long> box(long[] arr) {
        List<Long> out = new ArrayList<>(arr.length);
        for (long v : arr) out.add(v);
        return out;
    }

    private int labelIndex(LocalDateTime item, LocalDateTime bucketStart, boolean hourly) {
        if (item.isBefore(bucketStart)) return -1;
        if (hourly) {
            return (int) Duration.between(bucketStart, item).toHours();
        } else {
            return (int) Duration.between(bucketStart, item.toLocalDate().atStartOfDay()).toDays();
        }
    }

    // ------------------------------------------------------------------
    // Security analytics
    // ------------------------------------------------------------------

    private SecurityAnalytics buildSecurity(Instant from, Instant to, List<String> labels) {
        long total = securityLogRepository.countByTimestampBetween(from, to);
        long critical = securityLogRepository.countByRiskLevelAndTimestampBetween(RiskLevel.CRITICAL, from, to);
        long high = securityLogRepository.countByRiskLevelAndTimestampBetween(RiskLevel.HIGH, from, to);
        long medium = securityLogRepository.countByRiskLevelAndTimestampBetween(RiskLevel.MEDIUM, from, to);
        long low = securityLogRepository.countByRiskLevelAndTimestampBetween(RiskLevel.LOW, from, to);
        long failedLogins = loginHistoryRepository.countByStatusAndTimestampBetween("FAILED", from, to);
        long blockedIps = blockedIpRepository.findByStatus("ACTIVE").size();

        List<LabelValue> byRisk = List.of(
                LabelValue.builder().label("Critical").value(critical).build(),
                LabelValue.builder().label("High").value(high).build(),
                LabelValue.builder().label("Medium").value(medium).build(),
                LabelValue.builder().label("Low").value(low).build());

        List<Long> securitySeries = bucketInstant(securityLogRepository.findByTimestampBetween(from, to)
                .stream().map(com.photonicomega.facilities.module.security.domain.SecurityLog::getTimestamp).toList(), from, to, labels);
        List<LabelValue> overTime = zipLabels(labels, securitySeries);

        return SecurityAnalytics.builder()
                .total(total).critical(critical).high(high).medium(medium).low(low)
                .failedLogins(failedLogins).blockedIps(blockedIps)
                .byRiskLevel(byRisk).overTime(overTime)
                .build();
    }

    private List<LabelValue> zipLabels(List<String> labels, List<Long> values) {
        List<LabelValue> out = new ArrayList<>(labels.size());
        for (int i = 0; i < labels.size(); i++) {
            long v = i < values.size() ? values.get(i) : 0;
            out.add(LabelValue.builder().label(labels.get(i)).value(v).build());
        }
        return out;
    }

    // ------------------------------------------------------------------
    // AI performance (real in-memory request logs; never exposes keys)
    // ------------------------------------------------------------------

    private AiAnalytics buildAi() {
        List<AiStateManagementService.RequestLogDto> logs = aiStateService.getLogs();
        long total = logs.size();
        long successful = logs.stream().filter(l -> "SUCCESS".equalsIgnoreCase(l.getStatus())).count();
        long failed = logs.stream().filter(l -> "FAILED".equalsIgnoreCase(l.getStatus())).count();

        Double successRate = total == 0 ? null : Math.round(successful * 1000.0 / total) / 10.0;
        Long avgMs = logs.stream()
                .map(AiStateManagementService.RequestLogDto::getDuration)
                .filter(d -> d != null && d.endsWith(" ms"))
                .mapToLong(d -> {
                    try { return Long.parseLong(d.replace(" ms", "").trim()); }
                    catch (NumberFormatException e) { return 0L; }
                })
                .average().stream().mapToLong(Math::round).boxed().findFirst().orElse(null);

        Map<String, Long> byProvider = new LinkedHashMap<>();
        for (AiStateManagementService.RequestLogDto l : logs) {
            byProvider.merge(l.getProvider() != null ? l.getProvider() : "Unknown", 1L, Long::sum);
        }
        List<LabelValue> requestsByProvider = byProvider.entrySet().stream()
                .map(e -> LabelValue.builder().label(e.getKey()).value(e.getValue()).build())
                .sorted(Comparator.comparingLong(LabelValue::getValue).reversed())
                .toList();

        List<Provider> providers = aiStateService.getProviders().stream()
                .map(p -> Provider.builder()
                        .id(p.getId()).name(p.getName()).model(p.getModel())
                        .status(p.getStatus()).responseTime(p.getResponseTime())
                        .isDefault(p.isDefault()).type(p.getType())
                        .build())
                .toList();

        return AiAnalytics.builder()
                .totalRequests(total).successful(successful).failed(failed)
                .successRate(successRate).avgResponseTimeMs(avgMs)
                .source("IN_MEMORY")
                .providers(providers)
                .requestsByProvider(requestsByProvider)
                .build();
    }

    // ------------------------------------------------------------------
    // System health (real-time snapshot)
    // ------------------------------------------------------------------

    private SystemHealth buildHealth() {
        SubsystemHealthSnapshot.Snapshot snapshot = subsystemHealthMonitorService.getLatestSnapshot();
        if (snapshot == null) {
            return SystemHealth.builder().overallStatus("UNKNOWN").build();
        }
        List<Component> components = snapshot.getSubsystems().stream()
                .map(s -> Component.builder()
                        .id(s.getId()).name(s.getName()).status(s.getStatus())
                        .uptimePercent(s.getUptimePercent()).errorCount(s.getErrorCount())
                        .build())
                .toList();
        return SystemHealth.builder()
                .overallStatus(snapshot.getOverallStatus())
                .healthyCount(snapshot.getHealthyCount())
                .warningCount(snapshot.getWarningCount())
                .offlineCount(snapshot.getOfflineCount())
                .errorCount(snapshot.getErrorCount())
                .components(components)
                .build();
    }

    // ------------------------------------------------------------------
    // Audit analytics
    // ------------------------------------------------------------------

    private AuditAnalytics buildAudit(Instant from, Instant to) {
        List<com.photonicomega.facilities.module.auth.domain.AuditLog> logs =
                auditLogRepository.findByCreatedAtBetween(ldt(from), ldt(to));
        long total = logs.size();

        Map<String, Long> byModule = logs.stream()
                .filter(a -> a.getModule() != null && !a.getModule().isBlank())
                .collect(Collectors.groupingBy(com.photonicomega.facilities.module.auth.domain.AuditLog::getModule, Collectors.counting()));
        Map<String, Long> byAction = logs.stream()
                .filter(a -> a.getAction() != null && !a.getAction().isBlank())
                .collect(Collectors.groupingBy(com.photonicomega.facilities.module.auth.domain.AuditLog::getAction, Collectors.counting()));

        String mostActiveModule = byModule.entrySet().stream()
                .max(Comparator.comparingLong(Map.Entry::getValue)).map(Map.Entry::getKey).orElse(null);
        String mostCommonAction = byAction.entrySet().stream()
                .max(Comparator.comparingLong(Map.Entry::getValue)).map(Map.Entry::getKey).orElse(null);

        return AuditAnalytics.builder()
                .total(total)
                .byModule(toLabelValue(byModule))
                .byAction(toLabelValue(byAction))
                .mostActiveModule(mostActiveModule)
                .mostCommonAction(mostCommonAction)
                .build();
    }

    private List<LabelValue> toLabelValue(Map<String, Long> map) {
        return map.entrySet().stream()
                .map(e -> LabelValue.builder().label(e.getKey()).value(e.getValue()).build())
                .sorted(Comparator.comparingLong(LabelValue::getValue).reversed())
                .toList();
    }

    // ------------------------------------------------------------------
    // Documents / Contracts / Backups
    // ------------------------------------------------------------------

    private DocumentAnalytics buildDocuments(Instant from, Instant to) {
        return DocumentAnalytics.builder()
                .total(documentRepository.count())
                .uploaded(documentRepository.countByCreatedAtBetween(ldt(from), ldt(to)))
                .archived(documentRepository.countByStatus(DocumentStatus.ARCHIVED))
                .aiClassified(documentRepository.countByAiPredictedCategoryIsNotNull())
                .build();
    }

    private ContractAnalytics buildContracts() {
        LocalDate horizon = LocalDate.now(ZoneOffset.UTC).plusDays(30);
        return ContractAnalytics.builder()
                .total(contractRepository.count())
                .active(contractRepository.countByStatus(ContractStatus.ACTIVE))
                .expiringSoon(contractRepository.findExpiringContractsBefore(horizon).size())
                .expired(contractRepository.countByStatus(ContractStatus.EXPIRED))
                .renewed(contractRepository.countByStatus(ContractStatus.RENEWED))
                .build();
    }

    private BackupAnalytics buildBackups(Instant from, Instant to) {
        List<com.photonicomega.facilities.module.admin.domain.BackupRecord> inRange =
                backupRecordRepository.findByStartedAtBetween(from, to);
        long total = inRange.size();
        long success = inRange.stream().filter(b -> "COMPLETED".equalsIgnoreCase(b.getStatus())).count();
        long failed = inRange.stream().filter(b -> "FAILED".equalsIgnoreCase(b.getStatus())).count();
        Double successRate = total == 0 ? null : Math.round(success * 1000.0 / total) / 10.0;

        String lastSuccessfulAt = backupRecordRepository.findAllByOrderByStartedAtDesc().stream()
                .filter(b -> "COMPLETED".equalsIgnoreCase(b.getStatus()))
                .findFirst()
                .map(b -> b.getCompletedAt() != null ? b.getCompletedAt().toString() : b.getStartedAt().toString())
                .orElse(null);
        String lastBackupAt = backupRecordRepository.findFirstByOrderByStartedAtDesc() != null
                ? backupRecordRepository.findFirstByOrderByStartedAtDesc().getStartedAt().toString()
                : null;

        return BackupAnalytics.builder()
                .total(total).successCount(success).failedCount(failed).successRate(successRate)
                .lastSuccessfulAt(lastSuccessfulAt).lastBackupAt(lastBackupAt)
                .build();
    }

    // ------------------------------------------------------------------
    // Insights - computed only from real values above
    // ------------------------------------------------------------------

    private List<Insight> buildInsights(Instant from, Instant to) {
        List<Insight> insights = new ArrayList<>();

        long security = securityLogRepository.countByTimestampBetween(from, to);
        long errors = securityLogRepository.countByStatusAndTimestampBetween("FAILED", from, to);
        long failedLogins = loginHistoryRepository.countByStatusAndTimestampBetween("FAILED", from, to);

        if (security > 0) {
            insights.add(Insight.builder()
                    .severity(errors > 0 ? "warning" : "info")
                    .title("Security events: " + security)
                    .description(security + " security events recorded in this period, "
                            + errors + " failed (" + (security > 0 ? Math.round(errors * 100.0 / security) : 0) + "%).")
                    .build());
        }
        if (failedLogins > 0) {
            insights.add(Insight.builder()
                    .severity("critical")
                    .title("Failed logins: " + failedLogins)
                    .description("" + failedLogins + " login attempts were rejected. Review IP reputation in Security Center.")
                    .build());
        }

        long expiring = contractRepository.findExpiringContractsBefore(LocalDate.now(ZoneOffset.UTC).plusDays(30)).size();
        if (expiring > 0) {
            insights.add(Insight.builder()
                    .severity("warning")
                    .title("Contracts expiring: " + expiring)
                    .description("" + expiring + " active contracts approach their end date within 30 days.")
                    .build());
        }

        List<com.photonicomega.facilities.module.admin.domain.BackupRecord> inRange =
                backupRecordRepository.findByStartedAtBetween(from, to);
        long failedBackups = inRange.stream().filter(b -> "FAILED".equalsIgnoreCase(b.getStatus())).count();
        if (failedBackups > 0) {
            insights.add(Insight.builder()
                    .severity("critical")
                    .title("Backup failures: " + failedBackups)
                    .description("" + failedBackups + " backup run(s) failed in this period.")
                    .build());
        } else if (!inRange.isEmpty()) {
            insights.add(Insight.builder()
                    .severity("good")
                    .title("Backups healthy")
                    .description("No backup failures in this period (" + inRange.size() + " run(s)).")
                    .build());
        }

        AiAnalytics ai = buildAi();
        if (ai.getTotalRequests() > 0 && ai.getSuccessRate() != null) {
            insights.add(Insight.builder()
                    .severity(ai.getSuccessRate() >= 95 ? "good" : "warning")
                    .title("AI success rate: " + ai.getSuccessRate() + "%")
                    .description("" + ai.getSuccessful() + " of " + ai.getTotalRequests()
                            + " AI requests succeeded. Logs are in-memory (since last restart).")
                    .build());
        }

        long activeSessions = activeSessionRepository.findByStatus("ACTIVE").size();
        if (activeSessions > 0) {
            insights.add(Insight.builder()
                    .severity("info")
                    .title("Active sessions: " + activeSessions)
                    .description("" + activeSessions + " users are currently online.")
                    .build());
        }

        if (insights.isEmpty()) {
            insights.add(Insight.builder()
                    .severity("info")
                    .title("No activity in this period")
                    .description("No security, audit, backup, or AI activity was recorded for the selected range.")
                    .build());
        }
        return insights;
    }

    private LocalDateTime ldt(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}