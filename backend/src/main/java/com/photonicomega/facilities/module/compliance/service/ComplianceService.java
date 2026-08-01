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
import com.photonicomega.facilities.module.records.domain.PolicyAction;
import com.photonicomega.facilities.module.records.domain.RetentionPolicy;
import com.photonicomega.facilities.module.records.repository.RetentionPolicyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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
    private static final String MODULE = "COMPLIANCE";

    private final DocumentRepository documentRepository;
    private final ContractRepository contractRepository;
    private final RetentionPolicyRepository retentionPolicyRepository;
    private final DisposalRequestRepository disposalRequestRepository;
    private final ComplianceAlertRepository complianceAlertRepository;
    private final AuditService auditService;

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

    @Transactional
    public DisposalRequest requestDisposal(UUID documentId, String reason, User user) {
        Document doc = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document", "id", documentId));
        if (!disposalRequestRepository.findByDocumentIdAndStatus(documentId, DisposalStatus.PENDING).isEmpty()) {
            throw new BusinessRuleViolationException("A disposal request is already pending for this document.");
        }
        DisposalRequest req = DisposalRequest.builder()
                .documentId(documentId)
                .documentTitle(doc.getTitle())
                .reason(reason)
                .status(DisposalStatus.PENDING)
                .build();
        DisposalRequest saved = disposalRequestRepository.save(req);
        auditService.log(user, "REQUEST_DISPOSAL", MODULE, "DisposalRequest", saved.getId().toString(),
                "Requested disposal of document: " + doc.getTitle(), null);
        return saved;
    }

    @Transactional
    public DisposalRequest decideDisposal(UUID requestId, boolean approve, String notes, User user) {
        DisposalRequest req = disposalRequestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("DisposalRequest", "id", requestId));
        if (req.getStatus() != DisposalStatus.PENDING) {
            throw new BusinessRuleViolationException("This disposal request has already been decided.");
        }
        req.setStatus(approve ? DisposalStatus.APPROVED : DisposalStatus.REJECTED);
        req.setDecisionNotes(notes);
        req.setDecidedBy(user != null ? user.getEmail() : null);
        req.setDecidedAt(LocalDateTime.now());
        DisposalRequest saved = disposalRequestRepository.save(req);

        if (approve) {
            documentRepository.findById(req.getDocumentId()).ifPresent(doc -> {
                doc.setStatus(DocumentStatus.DELETED);
                doc.softDelete(user != null ? user.getEmail() : "system");
                documentRepository.save(doc);
            });
        }
        // Close the linked "disposal pending" alert regardless of decision.
        complianceAlertRepository.findByDedupKey("DISPOSAL_PENDING:" + requestId)
                .ifPresent(alert -> {
                    alert.setStatus(AlertStatus.DISMISSED);
                    complianceAlertRepository.save(alert);
                });

        auditService.log(user, approve ? "APPROVE_DISPOSAL" : "REJECT_DISPOSAL", MODULE,
                "DisposalRequest", requestId.toString(),
                (approve ? "Approved" : "Rejected") + " disposal of: " + req.getDocumentTitle(), null);
        return saved;
    }

    // --- Compliance alerts ---

    /**
     * Scans contracts, documents, and pending disposals and upserts alerts by
     * dedupKey. Idempotent: existing alerts keep their acknowledge/dismiss state.
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
