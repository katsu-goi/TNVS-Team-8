package com.photonicomega.facilities.module.compliance.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.auth.domain.AuditLog;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.AuditLogRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.compliance.domain.AlertStatus;
import com.photonicomega.facilities.module.compliance.domain.ComplianceAlert;
import com.photonicomega.facilities.module.compliance.domain.DisposalRequest;
import com.photonicomega.facilities.module.compliance.domain.DisposalStatus;
import com.photonicomega.facilities.module.compliance.repository.ComplianceAlertRepository;
import com.photonicomega.facilities.module.compliance.repository.DisposalRequestRepository;
import com.photonicomega.facilities.module.compliance.service.ComplianceService;
import com.photonicomega.facilities.module.contracts.domain.Contract;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.records.domain.RetentionPolicy;
import com.photonicomega.facilities.module.records.repository.RetentionPolicyRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Read-only dashboard and list endpoints for the Records/Compliance Officer role.
 * All endpoints return DTO maps (never raw entities) to stay lazy-safe under
 * {@code open-in-view: false}.
 */
@RestController
@RequestMapping("/v1/compliance")
@RequiredArgsConstructor
@Tag(name = "Records & Compliance", description = "Dashboard and read-only records/compliance oversight endpoints")
public class ComplianceController {

    private static final int EXPIRY_WINDOW_DAYS = 30;

    private final DocumentRepository documentRepository;
    private final ContractRepository contractRepository;
    private final RetentionPolicyRepository retentionPolicyRepository;
    private final AuditLogRepository auditLogRepository;
    private final DisposalRequestRepository disposalRequestRepository;
    private final ComplianceAlertRepository complianceAlertRepository;
    private final UserRepository userRepository;
    private final ComplianceService complianceService;

    @GetMapping("/dashboard/summary")
    @Operation(summary = "Compliance dashboard KPIs, distributions, and recent activity")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDashboardSummary() {
        List<Document> documents = documentRepository.findAll();
        List<Contract> contracts = contractRepository.findAll();

        long totalDocuments = documents.size();
        long pendingReview = documentRepository.countByStatus(DocumentStatus.PENDING_REVIEW);
        long approvedDocuments = documentRepository.countByStatus(DocumentStatus.APPROVED);
        long archivedDocuments = documentRepository.countByStatus(DocumentStatus.ARCHIVED);

        long totalContracts = contracts.size();
        long activeContracts = contractRepository.countByStatus(ContractStatus.ACTIVE);
        List<Contract> expiring = contractRepository.findExpiringContractsBefore(
                LocalDate.now().plusDays(EXPIRY_WINDOW_DAYS));

        long retentionPolicies = retentionPolicyRepository.findByActiveTrue().size();

        Map<String, Long> documentsByStatus = documents.stream()
                .filter(d -> d.getStatus() != null)
                .collect(Collectors.groupingBy(d -> d.getStatus().name(), Collectors.counting()));
        Map<String, Long> contractsByStatus = contracts.stream()
                .filter(c -> c.getStatus() != null)
                .collect(Collectors.groupingBy(c -> c.getStatus().name(), Collectors.counting()));

        long recentAuditEvents = auditLogRepository
                .findByCreatedAtAfterOrderByCreatedAtDesc(LocalDateTime.now().minusDays(7)).size();

        long pendingDisposals = disposalRequestRepository.countByStatus(DisposalStatus.PENDING);
        long openAlerts = complianceAlertRepository.countByStatus(AlertStatus.OPEN);

        List<Map<String, Object>> expiringSoon = expiring.stream()
                .sorted(Comparator.comparing(Contract::getEndDate, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(this::toContractDto)
                .collect(Collectors.toList());

        List<Map<String, Object>> recentDocuments = documents.stream()
                .sorted(Comparator.comparing(Document::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(5)
                .map(this::toDocumentDto)
                .collect(Collectors.toList());

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalDocuments", totalDocuments);
        summary.put("pendingReview", pendingReview);
        summary.put("approvedDocuments", approvedDocuments);
        summary.put("archivedDocuments", archivedDocuments);
        summary.put("totalContracts", totalContracts);
        summary.put("activeContracts", activeContracts);
        summary.put("expiringContracts", (long) expiring.size());
        summary.put("retentionPolicies", retentionPolicies);
        summary.put("recentAuditEvents", recentAuditEvents);
        summary.put("pendingDisposals", pendingDisposals);
        summary.put("openAlerts", openAlerts);
        summary.put("documentsByStatus", documentsByStatus);
        summary.put("contractsByStatus", contractsByStatus);
        summary.put("expiringSoon", expiringSoon);
        summary.put("recentDocuments", recentDocuments);
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @GetMapping("/documents")
    @Operation(summary = "List documents (optional status filter)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getDocuments(
            @RequestParam(required = false) DocumentStatus status) {
        List<Document> docs = status == null
                ? documentRepository.findAll()
                : documentRepository.findByStatus(status);
        List<Map<String, Object>> result = docs.stream().map(this::toDocumentDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Documents retrieved"));
    }

    @GetMapping("/contracts")
    @Operation(summary = "List contracts (optional status filter)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getContracts(
            @RequestParam(required = false) ContractStatus status) {
        List<Contract> contracts = status == null
                ? contractRepository.findAll()
                : contractRepository.findByStatus(status);
        List<Map<String, Object>> result = contracts.stream().map(this::toContractDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Contracts retrieved"));
    }

    @GetMapping("/retention-policies")
    @Operation(summary = "List retention policies")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getRetentionPolicies() {
        List<Map<String, Object>> result = retentionPolicyRepository.findAll().stream()
                .map(this::toPolicyDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Retention policies retrieved"));
    }

    @GetMapping("/audit-logs")
    @Operation(summary = "Recent audit-trail events (last 30 days)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAuditLogs() {
        List<Map<String, Object>> result = auditLogRepository
                .findByCreatedAtAfterOrderByCreatedAtDesc(LocalDateTime.now().minusDays(30)).stream()
                .map(this::toAuditDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Audit logs retrieved"));
    }

    // --- Document management (write) ---

    @PostMapping("/documents/{id}/approve")
    @Operation(summary = "Approve a document pending review")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approveDocument(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Document doc = complianceService.approveDocument(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toDocumentDto(doc), "Document approved"));
    }

    @PostMapping("/documents/{id}/archive")
    @Operation(summary = "Archive a document")
    public ResponseEntity<ApiResponse<Map<String, Object>>> archiveDocument(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Document doc = complianceService.archiveDocument(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toDocumentDto(doc), "Document archived"));
    }

    @PostMapping("/documents/{id}/disposal")
    @Operation(summary = "Request disposal of an archived document")
    public ResponseEntity<ApiResponse<Map<String, Object>>> requestDisposal(
            @PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        String reason = body == null ? null : (String) body.get("reason");
        DisposalRequest req = complianceService.requestDisposal(id, reason, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toDisposalDto(req), "Disposal requested"));
    }

    // --- Retention schedule management (write) ---

    @PostMapping("/retention-policies")
    @Operation(summary = "Create a retention policy")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRetentionPolicy(
            @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails userDetails) {
        RetentionPolicy p = complianceService.createRetentionPolicy(body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toPolicyDto(p), "Retention policy created"));
    }

    @PutMapping("/retention-policies/{id}")
    @Operation(summary = "Update a retention policy")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateRetentionPolicy(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        RetentionPolicy p = complianceService.updateRetentionPolicy(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toPolicyDto(p), "Retention policy updated"));
    }

    @PostMapping("/retention-policies/{id}/toggle")
    @Operation(summary = "Toggle a retention policy's active flag")
    public ResponseEntity<ApiResponse<Map<String, Object>>> toggleRetentionPolicy(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        RetentionPolicy p = complianceService.toggleRetentionPolicy(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toPolicyDto(p), "Retention policy updated"));
    }

    // --- Disposal approvals ---

    @GetMapping("/disposals")
    @Operation(summary = "List disposal requests (optional status filter)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getDisposals(
            @RequestParam(required = false) DisposalStatus status) {
        List<DisposalRequest> requests = status == null
                ? disposalRequestRepository.findAllByOrderByCreatedAtDesc()
                : disposalRequestRepository.findByStatusOrderByCreatedAtDesc(status);
        List<Map<String, Object>> result = requests.stream().map(this::toDisposalDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Disposal requests retrieved"));
    }

    @PostMapping("/disposals/{id}/approve")
    @Operation(summary = "Approve a disposal request (soft-deletes the document)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approveDisposal(
            @PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        String notes = body == null ? null : (String) body.get("notes");
        DisposalRequest req = complianceService.decideDisposal(id, true, notes, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toDisposalDto(req), "Disposal approved"));
    }

    @PostMapping("/disposals/{id}/reject")
    @Operation(summary = "Reject a disposal request")
    public ResponseEntity<ApiResponse<Map<String, Object>>> rejectDisposal(
            @PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        String notes = body == null ? null : (String) body.get("notes");
        DisposalRequest req = complianceService.decideDisposal(id, false, notes, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toDisposalDto(req), "Disposal rejected"));
    }

    // --- Compliance alerts ---

    @GetMapping("/alerts")
    @Operation(summary = "List active compliance alerts (regenerated on each call)")
    @Transactional
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAlerts() {
        complianceService.generateAlerts();
        List<Map<String, Object>> result = complianceAlertRepository
                .findByStatusInOrderByCreatedAtDesc(List.of(AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED)).stream()
                .map(this::toAlertDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Alerts retrieved"));
    }

    @PostMapping("/alerts/{id}/acknowledge")
    @Operation(summary = "Acknowledge a compliance alert")
    public ResponseEntity<ApiResponse<Map<String, Object>>> acknowledgeAlert(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        ComplianceAlert alert = complianceService.acknowledgeAlert(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toAlertDto(alert), "Alert acknowledged"));
    }

    @PostMapping("/alerts/{id}/dismiss")
    @Operation(summary = "Dismiss a compliance alert")
    public ResponseEntity<ApiResponse<Map<String, Object>>> dismissAlert(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        ComplianceAlert alert = complianceService.dismissAlert(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toAlertDto(alert), "Alert dismissed"));
    }

    // --- DTO mappers (lazy-safe: only scalar fields) ---

    private Map<String, Object> toDocumentDto(Document d) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", d.getId());
        m.put("title", d.getTitle());
        m.put("fileName", d.getFileName());
        m.put("fileType", d.getFileType());
        m.put("fileSize", d.getFileSize());
        m.put("status", d.getStatus());
        m.put("classificationLevel", d.getClassificationLevel());
        m.put("aiSummary", d.getAiSummary());
        m.put("versionNumber", d.getVersionNumber());
        m.put("createdAt", d.getCreatedAt());
        return m;
    }

    private Map<String, Object> toContractDto(Contract c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("contractNumber", c.getContractNumber());
        m.put("title", c.getTitle());
        m.put("type", c.getType());
        m.put("counterParty", c.getCounterParty());
        m.put("contractValue", c.getContractValue());
        m.put("startDate", c.getStartDate());
        m.put("endDate", c.getEndDate());
        m.put("renewalNoticeDate", c.getRenewalNoticeDate());
        m.put("status", c.getStatus());
        m.put("aiAssessedRiskLevel", c.getAiAssessedRiskLevel());
        m.put("aiRiskSummary", c.getAiRiskSummary());
        return m;
    }

    private Map<String, Object> toPolicyDto(RetentionPolicy p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", p.getId());
        m.put("name", p.getName());
        m.put("description", p.getDescription());
        m.put("retentionPeriodDays", p.getRetentionPeriodDays());
        m.put("actionOnExpiry", p.getActionOnExpiry());
        m.put("active", p.getActive());
        return m;
    }

    private Map<String, Object> toAuditDto(AuditLog a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.getId());
        m.put("action", a.getAction());
        m.put("entityType", a.getEntityType());
        m.put("entityName", a.getEntityName());
        m.put("module", a.getModule());
        m.put("userEmail", a.getUserEmail());
        m.put("severity", a.getSeverity());
        m.put("status", a.getStatus());
        m.put("createdAt", a.getCreatedAt());
        return m;
    }

    private Map<String, Object> toDisposalDto(DisposalRequest r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("documentId", r.getDocumentId());
        m.put("documentTitle", r.getDocumentTitle());
        m.put("reason", r.getReason());
        m.put("status", r.getStatus());
        m.put("decisionNotes", r.getDecisionNotes());
        m.put("decidedBy", r.getDecidedBy());
        m.put("decidedAt", r.getDecidedAt());
        m.put("createdAt", r.getCreatedAt());
        return m;
    }

    private Map<String, Object> toAlertDto(ComplianceAlert a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.getId());
        m.put("type", a.getType());
        m.put("severity", a.getSeverity());
        m.put("title", a.getTitle());
        m.put("message", a.getMessage());
        m.put("entityType", a.getEntityType());
        m.put("entityId", a.getEntityId());
        m.put("status", a.getStatus());
        m.put("acknowledgedBy", a.getAcknowledgedBy());
        m.put("acknowledgedAt", a.getAcknowledgedAt());
        m.put("createdAt", a.getCreatedAt());
        return m;
    }

    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) return null;
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }
}
