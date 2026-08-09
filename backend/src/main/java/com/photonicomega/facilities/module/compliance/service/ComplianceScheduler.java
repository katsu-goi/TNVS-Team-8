package com.photonicomega.facilities.module.compliance.service;

import com.photonicomega.facilities.module.auth.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Wires the three background compliance jobs whose cron expressions already
 * existed under {@code app.scheduler} but had no listener.
 *
 * <p>This class is a thin orchestrator: it owns no business logic, only the
 * schedule, the error boundary, and the audit trail. The work itself lives in
 * {@link ComplianceService}, so every job stays callable by hand from the
 * existing {@code /v1/compliance} endpoints.
 *
 * <p>Every job is wrapped in a try/catch. Spring's scheduler suppresses an
 * uncaught exception silently and, more importantly, must never take the
 * application down - a failed nightly scan is logged and the next run retries.
 *
 * <p>Disable the whole scheduler with {@code app.scheduler.enabled=false}
 * (useful for tests and for secondary instances that should not double-run the
 * jobs). Absent that property the scheduler is active.
 */
@Component
@ConditionalOnProperty(name = "app.scheduler.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class ComplianceScheduler {

    private static final String MODULE = "COMPLIANCE";
    private static final String VISITOR_MODULE = "VISITOR";

    private final ComplianceService complianceService;
    private final AuditService auditService;

    /**
     * Job A - contract expiry. Regenerates compliance alerts so expiring and
     * expired contracts surface without anyone opening the alerts page.
     */
    @Scheduled(cron = "${app.scheduler.contract-expiry-cron:0 0 8 * * ?}")
    public void runContractExpiryScan() {
        log.info("Scheduled job START: contract expiry scan");
        try {
            complianceService.generateAlerts();
            log.info("Scheduled job FINISH: contract expiry scan");
            audit("SCHEDULED_CONTRACT_EXPIRY_SCAN", MODULE,
                    "Contract expiry scan completed; compliance alerts regenerated.");
        } catch (Exception e) {
            log.error("Scheduled job FAILED: contract expiry scan - {}", e.getMessage(), e);
            audit("SCHEDULED_CONTRACT_EXPIRY_SCAN_FAILED", MODULE,
                    "Contract expiry scan failed: " + e.getMessage());
        }
    }

    /**
     * Job B - retention check. Assigns retention policies to documents that have
     * none, recomputes expiry dates, and regenerates alerts.
     */
    @Scheduled(cron = "${app.scheduler.retention-check-cron:0 0 2 * * ?}")
    public void runRetentionCheck() {
        log.info("Scheduled job START: retention check");
        try {
            int assigned = complianceService.applyRetentionToDocuments();
            log.info("Scheduled job FINISH: retention check ({} document(s) assigned)", assigned);
            audit("SCHEDULED_RETENTION_CHECK", MODULE,
                    "Retention check completed; assigned a retention policy to " + assigned
                            + " document(s) and regenerated compliance alerts.");
        } catch (Exception e) {
            log.error("Scheduled job FAILED: retention check - {}", e.getMessage(), e);
            audit("SCHEDULED_RETENTION_CHECK_FAILED", MODULE,
                    "Retention check failed: " + e.getMessage());
        }
    }

    /**
     * Job C - visitor cleanup. Closes out visits that were never checked out.
     */
    @Scheduled(cron = "${app.scheduler.visitor-cleanup-cron:0 0 1 * * ?}")
    public void runVisitorCleanup() {
        log.info("Scheduled job START: visitor cleanup");
        try {
            int closed = complianceService.autoCheckoutStaleVisitors();
            log.info("Scheduled job FINISH: visitor cleanup ({} visitor(s) auto-checked-out)", closed);
            audit("SCHEDULED_VISITOR_CLEANUP", VISITOR_MODULE,
                    "Visitor cleanup completed; auto-checked-out " + closed + " stale visitor(s).");
        } catch (Exception e) {
            log.error("Scheduled job FAILED: visitor cleanup - {}", e.getMessage(), e);
            audit("SCHEDULED_VISITOR_CLEANUP_FAILED", VISITOR_MODULE,
                    "Visitor cleanup failed: " + e.getMessage());
        }
    }

    /**
     * System-initiated audit entry (no authenticated user), so the SysAdmin
     * audit-logs page shows the jobs running. Never throws: AuditService already
     * swallows persistence failures, and a broken audit sink must not turn a
     * successful job into a failed one.
     */
    private void audit(String action, String module, String description) {
        try {
            auditService.log(null, action, module, "Scheduler", null, description, null);
        } catch (Exception e) {
            log.error("Failed to write scheduler audit entry for {}: {}", action, e.getMessage());
        }
    }
}
