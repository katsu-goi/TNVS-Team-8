package com.photonicomega.facilities.module.governance.service;

import com.photonicomega.facilities.module.auth.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Drives the one background governance job: lapsing approval requests whose
 * window closed without reaching quorum.
 *
 * <p>{@link ApprovalGateService#expireLapsed()} existed but nothing ever called
 * it, so {@code EXPIRED} was a status the code could name and never actually
 * reach. That is not a cosmetic gap. The gate permits only one open request per
 * act per target, so a request nobody got round to deciding stays PENDING for
 * ever, stays invisible to the approver queue (which filters on the window), and
 * blocks every future attempt to request that act on that target.
 *
 * <p>Runs quarter-hourly rather than nightly because that block is felt by a
 * user - the wait between a request lapsing and the target becoming requestable
 * again is dead time for whoever needs the act carried out.
 *
 * <p>Follows {@link com.photonicomega.facilities.module.compliance.service.ComplianceScheduler}:
 * a thin orchestrator owning only the schedule, the error boundary and the audit
 * entry, so the work itself stays callable by hand. Disable the whole scheduler
 * with {@code app.scheduler.enabled=false}.
 */
@Component
@ConditionalOnProperty(name = "app.scheduler.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class GovernanceScheduler {

    private static final String MODULE = "GOVERNANCE";

    private final ApprovalGateService approvalGateService;
    private final AuditService auditService;

    /**
     * Lapse approval requests whose window has closed. Only writes an audit entry
     * when something actually expired - a quarter-hourly no-op job that logged
     * every run would bury the entries that matter.
     */
    @Scheduled(cron = "${app.scheduler.approval-expiry-cron:0 */15 * * * ?}")
    public void runApprovalExpirySweep() {
        try {
            int expired = approvalGateService.expireLapsed();
            if (expired > 0) {
                log.info("Scheduled job FINISH: approval expiry sweep ({} request(s) lapsed)", expired);
                audit("SCHEDULED_APPROVAL_EXPIRY_SWEEP",
                        "Approval expiry sweep completed; " + expired
                                + " request(s) passed their window without quorum and were marked EXPIRED.");
            }
        } catch (Exception e) {
            log.error("Scheduled job FAILED: approval expiry sweep - {}", e.getMessage(), e);
            audit("SCHEDULED_APPROVAL_EXPIRY_SWEEP_FAILED",
                    "Approval expiry sweep failed: " + e.getMessage());
        }
    }

    /**
     * System-initiated audit entry (no authenticated user). Never throws: a
     * broken audit sink must not turn a successful sweep into a failed one.
     */
    private void audit(String action, String description) {
        try {
            auditService.log(null, action, MODULE, "Scheduler", null, description, null);
        } catch (Exception e) {
            log.error("Failed to write scheduler audit entry for {}: {}", action, e.getMessage());
        }
    }
}
