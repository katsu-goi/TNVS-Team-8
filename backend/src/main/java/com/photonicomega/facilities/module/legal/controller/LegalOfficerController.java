package com.photonicomega.facilities.module.legal.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.AuditLog;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.AuditLogRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.contracts.domain.Contract;
import com.photonicomega.facilities.module.contracts.domain.ContractClause;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.repository.ContractClauseRepository;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.legal.domain.*;
import com.photonicomega.facilities.module.legal.repository.LegalCaseRepository;
import com.photonicomega.facilities.module.legal.repository.LegalNoticeRepository;
import com.photonicomega.facilities.module.legal.service.LegalService;
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
 * Legal Officer endpoints: contract lifecycle + clause management, legal case
 * management, document approval, read-only retention/audit visibility, and a
 * stateful legal-notice feed. All endpoints return DTO maps (never raw
 * entities) to stay lazy-safe under {@code open-in-view: false}.
 */
@RestController
@RequestMapping("/v1/legal")
@RequiredArgsConstructor
@Tag(name = "Legal Officer", description = "Contract, legal case, and compliance oversight endpoints")
public class LegalOfficerController {

    private static final int EXPIRY_WINDOW_DAYS = 30;

    private final ContractRepository contractRepository;
    private final ContractClauseRepository contractClauseRepository;
    private final LegalCaseRepository legalCaseRepository;
    private final LegalNoticeRepository legalNoticeRepository;
    private final DocumentRepository documentRepository;
    private final RetentionPolicyRepository retentionPolicyRepository;
    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;
    private final LegalService legalService;

    // --- Dashboard ---

    @GetMapping("/dashboard/summary")
    @Operation(summary = "Legal dashboard KPIs, distributions, and recent activity")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDashboardSummary() {
        legalService.generateNotices();

        List<Contract> contracts = contractRepository.findAll();
        List<LegalCase> cases = legalCaseRepository.findAll();

        long pendingContractReviews = contractRepository.countByStatus(ContractStatus.UNDER_REVIEW);
        long activeContracts = contractRepository.countByStatus(ContractStatus.ACTIVE);
        List<Contract> expiring = contractRepository.findExpiringContractsBefore(
                LocalDate.now().plusDays(EXPIRY_WINDOW_DAYS));

        long totalCases = cases.size();
        long openCases = cases.stream()
                .filter(c -> c.getStatus() != CaseStatus.CLOSED && c.getStatus() != CaseStatus.SETTLED)
                .count();
        long highPriorityCases = cases.stream()
                .filter(c -> (c.getPriority() == CasePriority.HIGH || c.getPriority() == CasePriority.CRITICAL)
                        && c.getStatus() != CaseStatus.CLOSED && c.getStatus() != CaseStatus.SETTLED)
                .count();

        long documentReviewQueue = documentRepository.countByStatus(DocumentStatus.PENDING_REVIEW);
        long openNotices = legalNoticeRepository.countByStatus(NoticeStatus.OPEN);

        long recentAuditEvents = auditLogRepository
                .findByCreatedAtAfterOrderByCreatedAtDesc(LocalDateTime.now().minusDays(7)).size();

        Map<String, Long> contractsByStatus = contracts.stream()
                .filter(c -> c.getStatus() != null)
                .collect(Collectors.groupingBy(c -> c.getStatus().name(), Collectors.counting()));
        Map<String, Long> casesByStatus = cases.stream()
                .filter(c -> c.getStatus() != null)
                .collect(Collectors.groupingBy(c -> c.getStatus().name(), Collectors.counting()));

        List<Map<String, Object>> expiringSoon = expiring.stream()
                .sorted(Comparator.comparing(Contract::getEndDate, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(this::toContractDto)
                .collect(Collectors.toList());

        List<Map<String, Object>> pendingReviews = contractRepository.findByStatus(ContractStatus.UNDER_REVIEW)
                .stream().map(this::toContractDto).collect(Collectors.toList());

        List<Map<String, Object>> recentCases = cases.stream()
                .sorted(Comparator.comparing(LegalCase::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(5)
                .map(this::toCaseDto)
                .collect(Collectors.toList());

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("pendingContractReviews", pendingContractReviews);
        summary.put("activeContracts", activeContracts);
        summary.put("totalContracts", (long) contracts.size());
        summary.put("expiringContracts", (long) expiring.size());
        summary.put("totalCases", totalCases);
        summary.put("openCases", openCases);
        summary.put("highPriorityCases", highPriorityCases);
        summary.put("documentReviewQueue", documentReviewQueue);
        summary.put("openNotices", openNotices);
        summary.put("recentAuditEvents", recentAuditEvents);
        summary.put("contractsByStatus", contractsByStatus);
        summary.put("casesByStatus", casesByStatus);
        summary.put("expiringSoon", expiringSoon);
        summary.put("pendingReviews", pendingReviews);
        summary.put("recentCases", recentCases);
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    // --- Contracts ---

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

    @GetMapping("/contracts/{id}")
    @Operation(summary = "Get one contract with its clauses")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getContract(@PathVariable UUID id) {
        Contract c = contractRepository.findById(id)
                .orElseThrow(() -> new BusinessRuleViolationException("Contract not found: " + id));
        Map<String, Object> dto = toContractDto(c);
        List<Map<String, Object>> clauses = contractClauseRepository.findByContractId(id)
                .stream().map(this::toClauseDto).collect(Collectors.toList());
        dto.put("clauses", clauses);
        return ResponseEntity.ok(ApiResponse.success(dto, "Contract retrieved"));
    }

    @PostMapping("/contracts")
    @Operation(summary = "Create a contract (starts as DRAFT)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createContract(
            @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = legalService.createContract(body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract created"));
    }

    @PutMapping("/contracts/{id}")
    @Operation(summary = "Update a contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateContract(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = legalService.updateContract(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract updated"));
    }

    @PostMapping("/contracts/{id}/submit-review")
    @Operation(summary = "Submit a draft contract for review")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submitReview(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = legalService.submitForReview(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract submitted for review"));
    }

    @PostMapping("/contracts/{id}/approve")
    @Operation(summary = "Approve a contract under review")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approveContract(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = legalService.approveContract(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract approved"));
    }

    @PostMapping("/contracts/{id}/activate")
    @Operation(summary = "Activate an approved contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> activateContract(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = legalService.activateContract(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract activated"));
    }

    @PostMapping("/contracts/{id}/renew")
    @Operation(summary = "Renew a contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> renewContract(
            @PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = legalService.renewContract(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract renewed"));
    }

    @PostMapping("/contracts/{id}/terminate")
    @Operation(summary = "Terminate a contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> terminateContract(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = legalService.terminateContract(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract terminated"));
    }

    // --- Clauses ---

    @PostMapping("/contracts/{id}/clauses")
    @Operation(summary = "Add a clause to a contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addClause(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        ContractClause clause = legalService.addClause(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toClauseDto(clause), "Clause added"));
    }

    @PutMapping("/clauses/{id}")
    @Operation(summary = "Update a contract clause")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateClause(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        ContractClause clause = legalService.updateClause(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toClauseDto(clause), "Clause updated"));
    }

    @DeleteMapping("/clauses/{id}")
    @Operation(summary = "Delete a contract clause")
    public ResponseEntity<ApiResponse<String>> deleteClause(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        legalService.deleteClause(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success("Clause deleted"));
    }

    // --- Legal cases ---

    @GetMapping("/cases")
    @Operation(summary = "List legal cases (optional status filter)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getCases(
            @RequestParam(required = false) CaseStatus status) {
        List<LegalCase> cases = status == null
                ? legalCaseRepository.findAllByOrderByCreatedAtDesc()
                : legalCaseRepository.findByStatusOrderByCreatedAtDesc(status);
        List<Map<String, Object>> result = cases.stream().map(this::toCaseDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Legal cases retrieved"));
    }

    @GetMapping("/cases/{id}")
    @Operation(summary = "Get one legal case")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCase(@PathVariable UUID id) {
        LegalCase c = legalCaseRepository.findById(id)
                .orElseThrow(() -> new BusinessRuleViolationException("Legal case not found: " + id));
        return ResponseEntity.ok(ApiResponse.success(toCaseDto(c), "Legal case retrieved"));
    }

    @PostMapping("/cases")
    @Operation(summary = "Create a legal case")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createCase(
            @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails userDetails) {
        LegalCase c = legalService.createCase(body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toCaseDto(c), "Legal case created"));
    }

    @PutMapping("/cases/{id}")
    @Operation(summary = "Update a legal case")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateCase(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        LegalCase c = legalService.updateCase(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toCaseDto(c), "Legal case updated"));
    }

    @PostMapping("/cases/{id}/status")
    @Operation(summary = "Change a legal case's status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> changeCaseStatus(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        Object statusRaw = body == null ? null : body.get("status");
        if (statusRaw == null) {
            throw new BusinessRuleViolationException("A target status is required.");
        }
        CaseStatus status;
        try {
            status = CaseStatus.valueOf(String.valueOf(statusRaw).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid case status: " + statusRaw);
        }
        String notes = body.get("notes") == null ? null : String.valueOf(body.get("notes"));
        LegalCase c = legalService.changeCaseStatus(id, status, notes, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toCaseDto(c), "Case status updated"));
    }

    // --- Documents ---

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

    @PostMapping("/documents/{id}/approve")
    @Operation(summary = "Approve a document pending review")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approveDocument(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Document doc = legalService.approveDocument(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toDocumentDto(doc), "Document approved"));
    }

    // --- Retention policies (read-only) ---

    @GetMapping("/retention-policies")
    @Operation(summary = "List retention policies (read-only)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getRetentionPolicies() {
        List<Map<String, Object>> result = retentionPolicyRepository.findAll().stream()
                .map(this::toPolicyDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Retention policies retrieved"));
    }

    // --- Legal notices ---

    @GetMapping("/notices")
    @Operation(summary = "List active legal notices (regenerated on each call)")
    @Transactional
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getNotices() {
        legalService.generateNotices();
        List<Map<String, Object>> result = legalNoticeRepository
                .findByStatusInOrderByCreatedAtDesc(List.of(NoticeStatus.OPEN, NoticeStatus.ACKNOWLEDGED)).stream()
                .map(this::toNoticeDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Notices retrieved"));
    }

    @PostMapping("/notices/{id}/acknowledge")
    @Operation(summary = "Acknowledge a legal notice")
    public ResponseEntity<ApiResponse<Map<String, Object>>> acknowledgeNotice(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        LegalNotice notice = legalService.acknowledgeNotice(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toNoticeDto(notice), "Notice acknowledged"));
    }

    @PostMapping("/notices/{id}/dismiss")
    @Operation(summary = "Dismiss a legal notice")
    public ResponseEntity<ApiResponse<Map<String, Object>>> dismissNotice(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        LegalNotice notice = legalService.dismissNotice(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toNoticeDto(notice), "Notice dismissed"));
    }

    // --- Audit logs (read-only) ---

    @GetMapping("/audit-logs")
    @Operation(summary = "Recent audit-trail events (last 30 days)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAuditLogs() {
        List<Map<String, Object>> result = auditLogRepository
                .findByCreatedAtAfterOrderByCreatedAtDesc(LocalDateTime.now().minusDays(30)).stream()
                .map(this::toAuditDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Audit logs retrieved"));
    }

    // --- DTO mappers (lazy-safe: only scalar fields) ---

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
        m.put("createdAt", c.getCreatedAt());
        return m;
    }

    private Map<String, Object> toClauseDto(ContractClause clause) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", clause.getId());
        m.put("clauseType", clause.getClauseType());
        m.put("content", clause.getContent());
        m.put("riskLevel", clause.getRiskLevel());
        m.put("aiAnalysisNotes", clause.getAiAnalysisNotes());
        return m;
    }

    private Map<String, Object> toCaseDto(LegalCase c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("caseNumber", c.getCaseNumber());
        m.put("title", c.getTitle());
        m.put("description", c.getDescription());
        m.put("courtName", c.getCourtName());
        m.put("judgeName", c.getJudgeName());
        m.put("opposingParty", c.getOpposingParty());
        m.put("caseType", c.getCaseType());
        m.put("status", c.getStatus());
        m.put("priority", c.getPriority());
        m.put("leadLawyerName", c.getLeadLawyer() != null ? c.getLeadLawyer().getFullName() : null);
        m.put("filingDate", c.getFilingDate());
        m.put("expectedResolutionDate", c.getExpectedResolutionDate());
        m.put("closedDate", c.getClosedDate());
        m.put("resolutionNotes", c.getResolutionNotes());
        m.put("createdAt", c.getCreatedAt());
        return m;
    }

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

    private Map<String, Object> toNoticeDto(LegalNotice a) {
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

    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) return null;
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }
}
