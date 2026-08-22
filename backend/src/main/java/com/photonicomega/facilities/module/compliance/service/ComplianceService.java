package com.photonicomega.facilities.module.compliance.service;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.service.AuditService;
import com.photonicomega.facilities.module.compliance.domain.*;
import com.photonicomega.facilities.module.compliance.repository.ComplianceAlertRepository;
import com.photonicomega.facilities.module.compliance.repository.DisposalRequestRepository;
import com.photonicomega.facilities.module.contracts.domain.Contract;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.ApprovalStatus;
import com.photonicomega.facilities.module.governance.domain.DecisionType;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.ApprovalGateService;
import com.photonicomega.facilities.module.records.domain.PolicyAction;
import com.photonicomega.facilities.module.records.domain.RetentionPolicy;
import com.photonicomega.facilities.module.records.repository.RetentionPolicyRepository;
import com.photonicomega.facilities.module.visitor.domain.Visitor;
import com.photonicomega.facilities.module.visitor.domain.VisitorStatus;
import com.photonicomega.facilities.module.visitor.repository.VisitorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Business logic for the Records/Compliance Officer: document archiving,
 * retention-schedule management, disposal-approval workflow, and generation of
 * stateful compliance alerts. All mutations are recorded via {@link AuditService}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ComplianceService {

    private static final int EXPIRY_WINDOW_DAYS = 30;
    private static final int REVIEW_OVERDUE_DAYS = 14;
    private static final int VISITOR_STALE_HOURS = 12;
    private static final String MODULE = "COMPLIANCE";
    private static final String VISITOR_MODULE = "VISITOR";

    private final DocumentRepository documentRepository;
    private final ContractRepository contractRepository;
    private final RetentionPolicyRepository retentionPolicyRepository;
    private final DisposalRequestRepository disposalRequestRepository;
    private final ComplianceAlertRepository complianceAlertRepository;
    private final VisitorRepository visitorRepository;
    private final AuditService auditService;

    /**
     * The chokepoint for irreversible acts. Injected rather than reimplemented so
     * that disposal follows the same rules as the other fourteen gated actions,
     * and so a change to the two-person policy takes effect here automatically.
     */
    private final ApprovalGateService approvalGate;

    // --- Document archiving ---

    @Transactional
    public Document approveDocument(UUID id, User user) {
        Document doc = documentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document", "id", id));
        if (doc.getStatus() != DocumentStatus.PENDING_REVIEW) {
            throw new BusinessRuleViolationException("Only documents pending review can be approved.");
        }
        doc.setStatus(DocumentStatus.APPROVED);
        Document saved = documentRepository.save(doc);
        auditService.log(user, "APPROVE_DOCUMENT", MODULE, "Document", id.toString(),
                "Approved document: " + doc.getTitle(), null);
        return saved;
    }

    @Transactional
    public Document archiveDocument(UUID id, User user) {
        Document doc = documentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document", "id", id));
        if (doc.getStatus() == DocumentStatus.ARCHIVED || doc.getStatus() == DocumentStatus.DELETED) {
            throw new BusinessRuleViolationException("Document is already archived or disposed.");
        }
        doc.setStatus(DocumentStatus.ARCHIVED);
        Document saved = documentRepository.save(doc);
        auditService.log(user, "ARCHIVE_DOCUMENT", MODULE, "Document", id.toString(),
                "Archived document: " + doc.getTitle(), null);
        return saved;
    }

    // --- Retention schedules ---

    @Transactional
    public RetentionPolicy createRetentionPolicy(Map<String, Object> body, User user) {
        String name = str(body.get("name"));
        if (name == null || name.isBlank()) {
            throw new BusinessRuleViolationException("Policy name is required.");
        }
        retentionPolicyRepository.findByName(name).ifPresent(p -> {
            throw new BusinessRuleViolationException("A retention policy with that name already exists.");
        });
        RetentionPolicy policy = RetentionPolicy.builder()
                .name(name)
                .description(str(body.get("description")))
                .retentionPeriodDays(intVal(body.get("retentionPeriodDays"), 365))
                .actionOnExpiry(parseAction(body.get("actionOnExpiry")))
                .active(body.get("active") == null ? Boolean.TRUE : Boolean.valueOf(String.valueOf(body.get("active"))))
                .build();
        RetentionPolicy saved = retentionPolicyRepository.save(policy);
        auditService.log(user, "CREATE_RETENTION_POLICY", MODULE, "RetentionPolicy", saved.getId().toString(),
                "Created retention policy: " + name, null);
        return saved;
    }

    @Transactional
    public RetentionPolicy updateRetentionPolicy(UUID id, Map<String, Object> body, User user) {
        RetentionPolicy policy = retentionPolicyRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("RetentionPolicy", "id", id));
        if (body.containsKey("name") && str(body.get("name")) != null) policy.setName(str(body.get("name")));
        if (body.containsKey("description")) policy.setDescription(str(body.get("description")));
        if (body.containsKey("retentionPeriodDays"))
            policy.setRetentionPeriodDays(intVal(body.get("retentionPeriodDays"), policy.getRetentionPeriodDays()));
        if (body.containsKey("actionOnExpiry")) policy.setActionOnExpiry(parseAction(body.get("actionOnExpiry")));
        if (body.containsKey("active")) policy.setActive(Boolean.valueOf(String.valueOf(body.get("active"))));
        RetentionPolicy saved = retentionPolicyRepository.save(policy);
        auditService.log(user, "UPDATE_RETENTION_POLICY", MODULE, "RetentionPolicy", id.toString(),
                "Updated retention policy: " + policy.getName(), null);
        return saved;
    }

    @Transactional
    public RetentionPolicy toggleRetentionPolicy(UUID id, User user) {
        RetentionPolicy policy = retentionPolicyRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("RetentionPolicy", "id", id));
        policy.setActive(!Boolean.TRUE.equals(policy.getActive()));
        RetentionPolicy saved = retentionPolicyRepository.save(policy);
        auditService.log(user, "TOGGLE_RETENTION_POLICY", MODULE, "RetentionPolicy", id.toString(),
                "Set retention policy '" + policy.getName() + "' active=" + policy.getActive(), null);
        return saved;
    }

    // --- Disposal-approval workflow ---
    //
    // This was the worked example of the gap the approval gate exists to close.
    // requestDisposal recorded no requester, and decideDisposal compared the
    // decider against nobody - so one officer could raise a disposal and approve
    // it seconds later, and the resulting record was indistinguishable from a
    // properly reviewed one. Both halves now route through ApprovalGateService,
    // which is the only code path in the application that can destroy a document.
    //
    // The HTTP contract is unchanged on purpose: the existing screens already
    // present this as request-then-decide with a mandatory reason and a
    // confirmation dialog. What was missing was enforcement behind them, not UI.

    @Transactional
    public DisposalRequest requestDisposal(UUID documentId, String reason, User user) {
        Document doc = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document", "id", documentId));
        if (!disposalRequestRepository.findByDocumentIdAndStatus(documentId, DisposalStatus.PENDING).isEmpty()) {
            throw new BusinessRuleViolationException("A disposal request is already pending for this document.");
        }

        // Raise the governed approval first. If the gate refuses - no written
        // justification, a role not permitted to ask, a duplicate already in
        // flight - nothing at all is written, so there is no orphaned
        // DisposalRequest sitting in the queue with no authority behind it.
        ApprovalRequest approval = approvalGate.request(
                SensitiveAction.DOCUMENT_DISPOSE,
                "Document",
                documentId.toString(),
                doc.getTitle(),
                reason,
                null,
                user);

        DisposalRequest req = DisposalRequest.builder()
                .documentId(documentId)
                .documentTitle(doc.getTitle())
                .reason(reason)
                .status(DisposalStatus.PENDING)
                .requestedById(user.getId())
                .requestedByEmail(user.getEmail())
                .approvalRequestId(approval.getId())
                .build();
        DisposalRequest saved = disposalRequestRepository.save(req);
        auditService.log(user, "REQUEST_DISPOSAL", MODULE, "DisposalRequest", saved.getId().toString(),
                "Requested disposal of document: " + doc.getTitle()
                        + " (approval " + approval.getId() + ", AI risk " + approval.getAiRiskLevel() + ")", null);
        return saved;
    }

    /**
     * Records one approver's decision on a disposal.
     *
     * <p>This method no longer deletes anything itself. It delegates to the
     * approval gate, which refuses the vote unless the approver is a different
     * person from the requester, holds a role with authority over records
     * disposal, and has not already voted. Only once the gate marks the request
     * APPROVED is the disposal carried out - by the gate, through
     * {@code DocumentDisposalExecutor}.
     *
     * <p>Quorum and execution happen in the same call because the existing screen
     * presents approval as a single confirmed action. The separation that matters
     * is structural, not temporal: the mutation lives only in the executor, the
     * executor is reachable only from {@code execute()}, and {@code execute()} is
     * reachable only from an APPROVED request.
     */
    @Transactional
    public DisposalRequest decideDisposal(UUID requestId, boolean approve, String notes, User user) {
        DisposalRequest req = disposalRequestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("DisposalRequest", "id", requestId));
        if (req.getStatus() != DisposalStatus.PENDING) {
            throw new BusinessRuleViolationException("This disposal request has already been decided.");
        }
        if (req.getApprovalRequestId() == null) {
            // Fail closed. A row written before the gate existed carries no
            // requester identity, so the four-eyes rule cannot be verified for
            // it. Treating "cannot verify" as "therefore allow" is exactly the
            // hole being fixed, so the officer is told to raise it again instead.
            throw new BusinessRuleViolationException(
                    "This disposal request predates the approval workflow and carries no record of who "
                            + "raised it, so separation of duties cannot be verified. Raise the disposal "
                            + "again to have it reviewed properly.");
        }

        ApprovalRequest approval = approvalGate.decide(
                req.getApprovalRequestId(),
                approve ? DecisionType.APPROVE : DecisionType.REJECT,
                notes,
                user,
                null);

        if (approval.getStatus() == ApprovalStatus.APPROVED) {
            approval = approvalGate.execute(approval.getId(), user, null);
        }

        switch (approval.getStatus()) {
            case EXECUTED -> req.setStatus(DisposalStatus.APPROVED);
            case REJECTED -> req.setStatus(DisposalStatus.REJECTED);
            default -> {
                // Still short of quorum: more signatures needed. The disposal
                // stays PENDING and its alert stays open, because nothing has
                // been decided yet.
                req.setDecisionNotes(notes);
                DisposalRequest partial = disposalRequestRepository.save(req);
                return partial;
            }
        }
        req.setDecisionNotes(notes);
        req.setDecidedBy(user != null ? user.getEmail() : null);
        req.setDecidedAt(LocalDateTime.now());
        DisposalRequest saved = disposalRequestRepository.save(req);

        // Close the linked "disposal pending" alert now that it is settled.
        complianceAlertRepository.findByDedupKey("DISPOSAL_PENDING:" + requestId)
                .ifPresent(alert -> {
                    alert.setStatus(AlertStatus.DISMISSED);
                    complianceAlertRepository.save(alert);
                });

        auditService.log(user, approve ? "APPROVE_DISPOSAL" : "REJECT_DISPOSAL", MODULE,
                "DisposalRequest", requestId.toString(),
                (approve ? "Approved" : "Rejected") + " disposal of: " + req.getDocumentTitle()
                        + " under approval " + approval.getId(), null);
        return saved;
    }

    // --- Compliance alerts ---

    /**
     * Scans contracts, documents, retention windows, and pending disposals and
     * upserts alerts by dedupKey. Idempotent: existing alerts keep their
     * acknowledge/dismiss state.
     */
    @Transactional
    public void generateAlerts() {
        LocalDate today = LocalDate.now();

        for (Contract c : contractRepository.findExpiringContractsBefore(today.plusDays(EXPIRY_WINDOW_DAYS))) {
            upsertAlert("CONTRACT_EXPIRING:" + c.getId(), AlertType.CONTRACT_EXPIRING, AlertSeverity.WARNING,
                    "Contract expiring soon: " + c.getTitle(),
                    c.getContractNumber() + " with " + c.getCounterParty() + " ends " + c.getEndDate() + ".",
                    "Contract", c.getId().toString());
        }
        for (Contract c : contractRepository.findByStatus(ContractStatus.EXPIRED)) {
            upsertAlert("CONTRACT_EXPIRED:" + c.getId(), AlertType.CONTRACT_EXPIRED, AlertSeverity.CRITICAL,
                    "Contract expired: " + c.getTitle(),
                    c.getContractNumber() + " with " + c.getCounterParty() + " expired on " + c.getEndDate() + ".",
                    "Contract", c.getId().toString());
        }
        LocalDateTime overdueBefore = LocalDateTime.now().minusDays(REVIEW_OVERDUE_DAYS);
        for (Document d : documentRepository.findByStatus(DocumentStatus.PENDING_REVIEW)) {
            if (d.getCreatedAt() != null && d.getCreatedAt().isBefore(overdueBefore)) {
                upsertAlert("DOCUMENT_REVIEW_OVERDUE:" + d.getId(), AlertType.DOCUMENT_REVIEW_OVERDUE,
                        AlertSeverity.WARNING, "Document review overdue: " + d.getTitle(),
                        "Pending review for more than " + REVIEW_OVERDUE_DAYS + " days.",
                        "Document", d.getId().toString());
            }
        }
        for (DisposalRequest r : disposalRequestRepository.findByStatusOrderByCreatedAtDesc(DisposalStatus.PENDING)) {
            upsertAlert("DISPOSAL_PENDING:" + r.getId(), AlertType.DISPOSAL_PENDING, AlertSeverity.INFO,
                    "Disposal awaiting approval: " + r.getDocumentTitle(),
                    "A document disposal request requires your decision.",
                    "DisposalRequest", r.getId().toString());
        }

        // Retention windows. Only documents that already carry a schedule are
        // considered - assignment happens in applyRetentionToDocuments().
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime retentionWindowEnd = now.plusDays(EXPIRY_WINDOW_DAYS);
        for (Document d : documentRepository.findByRetentionExpiresAtIsNotNullAndDeletedFalse()) {
            if (d.getStatus() == DocumentStatus.DELETED) {
                continue; // Already disposed of; retention no longer applies.
            }
            LocalDateTime expiresAt = d.getRetentionExpiresAt();
            if (expiresAt.isBefore(now)) {
                upsertAlert("RETENTION_EXPIRED:" + d.getId(), AlertType.RETENTION_EXPIRED,
                        AlertSeverity.CRITICAL, "Retention period expired: " + d.getTitle(),
                        "Retention ended on " + expiresAt.toLocalDate()
                                + ". Review this document for disposal or re-classification.",
                        "Document", d.getId().toString());
            } else if (expiresAt.isBefore(retentionWindowEnd)) {
                upsertAlert("RETENTION_EXPIRING:" + d.getId(), AlertType.RETENTION_EXPIRING,
                        AlertSeverity.WARNING, "Retention period ending soon: " + d.getTitle(),
                        "Retention ends on " + expiresAt.toLocalDate()
                                + ", within the next " + EXPIRY_WINDOW_DAYS + " days.",
                        "Document", d.getId().toString());
            }
        }
    }

    private void upsertAlert(String dedupKey, AlertType type, AlertSeverity severity,
                             String title, String message, String entityType, String entityId) {
        if (complianceAlertRepository.findByDedupKey(dedupKey).isPresent()) {
            return; // Preserve existing state (acknowledged/dismissed).
        }
        complianceAlertRepository.save(ComplianceAlert.builder()
                .type(type)
                .severity(severity)
                .title(title)
                .message(message)
                .entityType(entityType)
                .entityId(entityId)
                .status(AlertStatus.OPEN)
                .dedupKey(dedupKey)
                .build());
    }

    @Transactional
    public ComplianceAlert acknowledgeAlert(UUID id, User user) {
        ComplianceAlert alert = complianceAlertRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("ComplianceAlert", "id", id));
        alert.setStatus(AlertStatus.ACKNOWLEDGED);
        alert.setAcknowledgedBy(user != null ? user.getEmail() : null);
        alert.setAcknowledgedAt(LocalDateTime.now());
        ComplianceAlert saved = complianceAlertRepository.save(alert);
        auditService.log(user, "ACKNOWLEDGE_ALERT", MODULE, "ComplianceAlert", id.toString(),
                "Acknowledged alert: " + alert.getTitle(), null);
        return saved;
    }

    @Transactional
    public ComplianceAlert dismissAlert(UUID id, User user) {
        ComplianceAlert alert = complianceAlertRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("ComplianceAlert", "id", id));
        alert.setStatus(AlertStatus.DISMISSED);
        ComplianceAlert saved = complianceAlertRepository.save(alert);
        auditService.log(user, "DISMISS_ALERT", MODULE, "ComplianceAlert", id.toString(),
                "Dismissed alert: " + alert.getTitle(), null);
        return saved;
    }

    // --- Scheduled automation (driven by ComplianceScheduler) ---

    /**
     * Assigns a retention policy to every document that does not have one yet,
     * computes {@code retentionExpiresAt = createdAt + retentionPeriodDays}, and
     * then regenerates compliance alerts.
     *
     * <p>Matching is by policy <em>name</em>, case-insensitively, against the
     * document's category name and its AI-predicted category. When nothing
     * matches, the first active policy whose name contains {@code GENERAL} or
     * {@code DEFAULT} is used as the catch-all; if there is no such policy the
     * document is left unassigned and skipped. Policies are never created here -
     * only what already exists in {@code retention_policies} is assigned.
     *
     * <p>Idempotent and safe to re-run: documents that already carry a policy are
     * not touched, except to backfill a missing expiry date.
     *
     * @return the number of documents whose retention fields were written
     */
    @Transactional
    public int applyRetentionToDocuments() {
        List<RetentionPolicy> policies = retentionPolicyRepository.findByActiveTrue().stream()
                .filter(p -> p.getName() != null && p.getRetentionPeriodDays() != null)
                .toList();
        if (policies.isEmpty()) {
            log.warn("Retention check: no active retention policies exist, nothing to assign.");
            generateAlerts();
            return 0;
        }
        RetentionPolicy fallback = policies.stream()
                .filter(p -> {
                    String n = p.getName().toUpperCase(Locale.ROOT);
                    return n.contains("GENERAL") || n.contains("DEFAULT");
                })
                .findFirst()
                .orElse(null);

        int assigned = 0;
        for (Document d : documentRepository.findByRetentionPolicyIdIsNullAndDeletedFalse()) {
            RetentionPolicy policy = matchPolicy(d, policies).orElse(fallback);
            if (policy == null) {
                continue; // No name match and no GENERAL/DEFAULT catch-all: leave unassigned.
            }
            d.setRetentionPolicyId(policy.getId());
            d.setRetentionExpiresAt(retentionExpiryFor(d, policy));
            documentRepository.save(d);
            assigned++;
        }

        // Backfill: a document may carry a policy id from an earlier run that
        // predates the expiry column, or from a direct SQL assignment.
        for (Document d : documentRepository
                .findByRetentionPolicyIdIsNotNullAndRetentionExpiresAtIsNullAndDeletedFalse()) {
            retentionPolicyRepository.findById(d.getRetentionPolicyId()).ifPresent(p -> {
                if (p.getRetentionPeriodDays() != null) {
                    d.setRetentionExpiresAt(retentionExpiryFor(d, p));
                    documentRepository.save(d);
                }
            });
        }

        log.info("Retention check: assigned a retention policy to {} document(s).", assigned);
        generateAlerts();
        return assigned;
    }

    /**
     * Closes out visitors who were registered or checked in but never checked
     * out. A visit is stale once its arrival time (actual if recorded, otherwise
     * expected) is more than {@value #VISITOR_STALE_HOURS} hours old and no
     * departure has been recorded.
     *
     * <p>Only {@code status} is changed - {@code actualDeparture} is deliberately
     * left null rather than fabricating a departure timestamp the system never
     * observed.
     *
     * @return the number of visitors auto-checked-out
     */
    @Transactional
    public int autoCheckoutStaleVisitors() {
        LocalDateTime staleBefore = LocalDateTime.now().minusHours(VISITOR_STALE_HOURS);
        int closed = 0;
        for (VisitorStatus status : List.of(VisitorStatus.REGISTERED, VisitorStatus.CHECKED_IN)) {
            for (Visitor v : visitorRepository.findByStatus(status)) {
                if (v.getActualDeparture() != null) {
                    continue;
                }
                LocalDateTime arrival = v.getActualArrival() != null ? v.getActualArrival() : v.getExpectedArrival();
                if (arrival == null || !arrival.isBefore(staleBefore)) {
                    continue;
                }
                v.setStatus(VisitorStatus.CHECKED_OUT);
                visitorRepository.save(v);
                auditService.log(null, "AUTO_CHECKOUT_VISITOR", VISITOR_MODULE, "Visitor",
                        v.getId().toString(),
                        "Auto-checked-out stale visitor '" + v.getFullName() + "' (was " + status
                                + ", arrival " + arrival + ", no departure recorded after "
                                + VISITOR_STALE_HOURS + "h).", null);
                closed++;
            }
        }
        log.info("Visitor cleanup: auto-checked-out {} stale visitor(s).", closed);
        return closed;
    }

    /** Case-insensitive match of the document's category names against policy names. */
    private Optional<RetentionPolicy> matchPolicy(Document d, List<RetentionPolicy> policies) {
        List<String> candidates = new ArrayList<>();
        if (d.getCategory() != null && d.getCategory().getName() != null) {
            candidates.add(d.getCategory().getName());
        }
        if (d.getAiPredictedCategory() != null) {
            candidates.add(d.getAiPredictedCategory());
        }
        for (String candidate : candidates) {
            String needle = candidate.trim();
            Optional<RetentionPolicy> hit = policies.stream()
                    .filter(p -> p.getName().trim().equalsIgnoreCase(needle))
                    .findFirst();
            if (hit.isPresent()) {
                return hit;
            }
        }
        return Optional.empty();
    }

    private static LocalDateTime retentionExpiryFor(Document d, RetentionPolicy policy) {
        // Documents created before BaseEntity auditing was in place can have a
        // null createdAt; date the retention window from now in that case.
        LocalDateTime base = d.getCreatedAt() != null ? d.getCreatedAt() : LocalDateTime.now();
        return base.plusDays(policy.getRetentionPeriodDays());
    }

    // --- helpers ---

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static int intVal(Object o, int fallback) {
        if (o == null) return fallback;
        try {
            return (int) Double.parseDouble(String.valueOf(o));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static PolicyAction parseAction(Object o) {
        if (o == null) return PolicyAction.REVIEW;
        try {
            return PolicyAction.valueOf(String.valueOf(o).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid actionOnExpiry: " + o);
        }
    }
}
