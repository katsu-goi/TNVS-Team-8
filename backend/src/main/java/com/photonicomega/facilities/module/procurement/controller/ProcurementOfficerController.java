package com.photonicomega.facilities.module.procurement.controller;

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
import com.photonicomega.facilities.module.documents.service.DocumentAccessPolicy;
import com.photonicomega.facilities.module.legal.domain.LegalCase;
import com.photonicomega.facilities.module.legal.repository.LegalCaseRepository;
import com.photonicomega.facilities.module.procurement.domain.*;
import com.photonicomega.facilities.module.procurement.repository.ProcurementNoticeRepository;
import com.photonicomega.facilities.module.procurement.repository.VendorObligationRepository;
import com.photonicomega.facilities.module.procurement.repository.VendorRepository;
import com.photonicomega.facilities.module.procurement.service.ProcurementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Contract / Procurement Officer endpoints: full contract lifecycle + clause
 * management, vendor/supplier management with performance + SLA tracking,
 * vendor obligation tracking, document approval, read-only legal-case and
 * audit visibility, and a stateful procurement-notice feed. All endpoints
 * return DTO maps (never raw entities) to stay lazy-safe under
 * {@code open-in-view: false}.
 */
@RestController
@RequestMapping("/v1/procurement")
@RequiredArgsConstructor
@Tag(name = "Contract Officer", description = "Contract lifecycle, vendor, and procurement oversight endpoints")
public class ProcurementOfficerController {

    private static final int EXPIRY_WINDOW_DAYS = 30;
    private static final int RENEWAL_WINDOW_DAYS = 30;

    private final ContractRepository contractRepository;
    private final ContractClauseRepository contractClauseRepository;
    private final VendorRepository vendorRepository;
    private final VendorObligationRepository vendorObligationRepository;
    private final ProcurementNoticeRepository procurementNoticeRepository;
    private final DocumentRepository documentRepository;
    private final LegalCaseRepository legalCaseRepository;
    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;
    private final ProcurementService procurementService;
    private final DocumentAccessPolicy documentAccessPolicy;

    // --- Dashboard ---

    @GetMapping("/dashboard/summary")
    @Operation(summary = "Procurement dashboard KPIs, distributions, and recent activity")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDashboardSummary() {
        procurementService.generateNotices();

        List<Contract> contracts = contractRepository.findAll();
        List<Vendor> vendors = vendorRepository.findAll();
        List<VendorObligation> obligations = vendorObligationRepository.findAll();

        long pendingContractReviews = contractRepository.countByStatus(ContractStatus.UNDER_REVIEW);
        long activeContracts = contractRepository.countByStatus(ContractStatus.ACTIVE);
        List<Contract> expiring = contractRepository.findExpiringContractsBefore(
                LocalDate.now().plusDays(EXPIRY_WINDOW_DAYS));

        BigDecimal totalActiveContractValue = contracts.stream()
                .filter(c -> c.getStatus() == ContractStatus.ACTIVE && c.getContractValue() != null)
                .map(Contract::getContractValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        long totalVendors = vendors.size();
        long activeVendors = vendors.stream().filter(v -> v.getStatus() == VendorStatus.ACTIVE).count();
        Double avgVendorPerformance = vendors.stream()
                .filter(v -> v.getPerformanceScore() != null)
                .mapToInt(Vendor::getPerformanceScore).average().orElse(0.0);
        Double avgSlaCompliance = vendors.stream()
                .filter(v -> v.getSlaComplianceRate() != null)
                .mapToDouble(v -> v.getSlaComplianceRate().doubleValue()).average().orElse(0.0);

        long openObligations = obligations.stream()
                .filter(o -> o.getStatus() != ObligationStatus.COMPLETED).count();
        LocalDate today = LocalDate.now();
        long overdueObligations = obligations.stream()
                .filter(o -> o.getStatus() != ObligationStatus.COMPLETED
                        && o.getDueDate() != null && o.getDueDate().isBefore(today))
                .count();

        long documentReviewQueue = documentRepository.countByStatus(DocumentStatus.PENDING_REVIEW);
        long openNotices = procurementNoticeRepository.countByStatus(NoticeStatus.OPEN);

        long recentAuditEvents = auditLogRepository
                .findByCreatedAtAfterOrderByCreatedAtDesc(LocalDateTime.now().minusDays(7)).size();

        Map<String, Long> contractsByStatus = contracts.stream()
                .filter(c -> c.getStatus() != null)
                .collect(Collectors.groupingBy(c -> c.getStatus().name(), Collectors.counting()));
        Map<String, Long> contractsByType = contracts.stream()
                .filter(c -> c.getType() != null)
                .collect(Collectors.groupingBy(c -> c.getType().name(), Collectors.counting()));
        Map<String, Long> vendorsByStatus = vendors.stream()
                .filter(v -> v.getStatus() != null)
                .collect(Collectors.groupingBy(v -> v.getStatus().name(), Collectors.counting()));

        List<Map<String, Object>> expiringSoon = expiring.stream()
                .sorted(Comparator.comparing(Contract::getEndDate, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(this::toContractDto)
                .collect(Collectors.toList());

        List<Map<String, Object>> pendingReviews = contractRepository.findByStatus(ContractStatus.UNDER_REVIEW)
                .stream().map(this::toContractDto).collect(Collectors.toList());

        List<Map<String, Object>> recentlyUpdatedContracts = contracts.stream()
                .sorted(Comparator.comparing(Contract::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(5)
                .map(this::toContractDto)
                .collect(Collectors.toList());

        List<Map<String, Object>> vendorPerformance = vendors.stream()
                .filter(v -> v.getPerformanceScore() != null || v.getSlaComplianceRate() != null)
                .sorted(Comparator.comparing(
                        (Vendor v) -> v.getPerformanceScore() == null ? Integer.MAX_VALUE : v.getPerformanceScore()))
                .map(this::toVendorDto)
                .collect(Collectors.toList());

        List<Map<String, Object>> renewalAlerts = contractRepository.findByStatus(ContractStatus.ACTIVE).stream()
                .filter(c -> {
                    LocalDate r = c.getRenewalNoticeDate();
                    return r != null && !r.isBefore(today) && !r.isAfter(today.plusDays(RENEWAL_WINDOW_DAYS));
                })
                .sorted(Comparator.comparing(Contract::getRenewalNoticeDate,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(this::toContractDto)
                .collect(Collectors.toList());

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("activeContracts", activeContracts);
        summary.put("pendingContractReviews", pendingContractReviews);
        summary.put("expiringContracts", (long) expiring.size());
        summary.put("totalContracts", (long) contracts.size());
        summary.put("totalActiveContractValue", totalActiveContractValue);
        summary.put("totalVendors", totalVendors);
        summary.put("activeVendors", activeVendors);
        summary.put("avgVendorPerformance", Math.round(avgVendorPerformance * 10.0) / 10.0);
        summary.put("avgSlaCompliance", Math.round(avgSlaCompliance * 10.0) / 10.0);
        summary.put("openObligations", openObligations);
        summary.put("overdueObligations", overdueObligations);
        summary.put("openNotices", openNotices);
        summary.put("documentReviewQueue", documentReviewQueue);
        summary.put("recentAuditEvents", recentAuditEvents);
        summary.put("contractsByStatus", contractsByStatus);
        summary.put("contractsByType", contractsByType);
        summary.put("vendorsByStatus", vendorsByStatus);
        summary.put("expiringSoon", expiringSoon);
        summary.put("pendingReviews", pendingReviews);
        summary.put("recentlyUpdatedContracts", recentlyUpdatedContracts);
        summary.put("vendorPerformance", vendorPerformance);
        summary.put("renewalAlerts", renewalAlerts);
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    // --- Contracts ---

    @GetMapping("/contracts")
    @Operation(summary = "List contracts (optional status / vendor filter)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getContracts(
            @RequestParam(required = false) ContractStatus status,
            @RequestParam(required = false) UUID vendorId) {
        List<Contract> contracts;
        if (vendorId != null) {
            contracts = contractRepository.findByVendorId(vendorId);
        } else if (status != null) {
            contracts = contractRepository.findByStatus(status);
        } else {
            contracts = contractRepository.findAll();
        }
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
        Contract c = procurementService.createContract(body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract created"));
    }

    @PutMapping("/contracts/{id}")
    @Operation(summary = "Update a contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateContract(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = procurementService.updateContract(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract updated"));
    }

    @PostMapping("/contracts/{id}/submit-review")
    @Operation(summary = "Submit a draft contract for review")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submitReview(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = procurementService.submitForReview(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract submitted for review"));
    }

    @PostMapping("/contracts/{id}/approve")
    @Operation(summary = "Approve a contract under review")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approveContract(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = procurementService.approveContract(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract approved"));
    }

    @PostMapping("/contracts/{id}/activate")
    @Operation(summary = "Activate an approved contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> activateContract(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = procurementService.activateContract(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract activated"));
    }

    @PostMapping("/contracts/{id}/renew")
    @Operation(summary = "Renew a contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> renewContract(
            @PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = procurementService.renewContract(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract renewed"));
    }

    @PostMapping("/contracts/{id}/terminate")
    @Operation(summary = "Terminate a contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> terminateContract(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Contract c = procurementService.terminateContract(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toContractDto(c), "Contract terminated"));
    }

    // --- Clauses ---

    @PostMapping("/contracts/{id}/clauses")
    @Operation(summary = "Add a clause to a contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addClause(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        ContractClause clause = procurementService.addClause(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toClauseDto(clause), "Clause added"));
    }

    @PutMapping("/clauses/{id}")
    @Operation(summary = "Update a contract clause")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateClause(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        ContractClause clause = procurementService.updateClause(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toClauseDto(clause), "Clause updated"));
    }

    @DeleteMapping("/clauses/{id}")
    @Operation(summary = "Delete a contract clause")
    public ResponseEntity<ApiResponse<String>> deleteClause(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        procurementService.deleteClause(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success("Clause deleted"));
    }

    // --- Vendors ---

    @GetMapping("/vendors")
    @Operation(summary = "List vendors (optional status filter)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getVendors(
            @RequestParam(required = false) VendorStatus status) {
        List<Vendor> vendors = status == null
                ? vendorRepository.findAll()
                : vendorRepository.findByStatus(status);
        List<Map<String, Object>> result = vendors.stream().map(this::toVendorDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Vendors retrieved"));
    }

    @GetMapping("/vendors/{id}")
    @Operation(summary = "Get one vendor with obligations and linked contracts")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getVendor(@PathVariable UUID id) {
        Vendor v = vendorRepository.findById(id)
                .orElseThrow(() -> new BusinessRuleViolationException("Vendor not found: " + id));
        Map<String, Object> dto = toVendorDto(v);
        List<Map<String, Object>> obligations = vendorObligationRepository.findByVendorId(id)
                .stream().map(this::toObligationDto).collect(Collectors.toList());
        dto.put("obligations", obligations);
        List<Map<String, Object>> contracts = contractRepository.findByVendorId(id)
                .stream().map(this::toContractDto).collect(Collectors.toList());
        dto.put("contracts", contracts);
        return ResponseEntity.ok(ApiResponse.success(dto, "Vendor retrieved"));
    }

    @PostMapping("/vendors")
    @Operation(summary = "Create a vendor")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createVendor(
            @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails userDetails) {
        Vendor v = procurementService.createVendor(body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toVendorDto(v), "Vendor created"));
    }

    @PutMapping("/vendors/{id}")
    @Operation(summary = "Update a vendor")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateVendor(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        Vendor v = procurementService.updateVendor(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toVendorDto(v), "Vendor updated"));
    }

    @PostMapping("/vendors/{id}/status")
    @Operation(summary = "Change a vendor's status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> changeVendorStatus(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        Object statusRaw = body == null ? null : body.get("status");
        if (statusRaw == null) {
            throw new BusinessRuleViolationException("A target status is required.");
        }
        VendorStatus status;
        try {
            status = VendorStatus.valueOf(String.valueOf(statusRaw).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid vendor status: " + statusRaw);
        }
        Vendor v = procurementService.changeVendorStatus(id, status, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toVendorDto(v), "Vendor status updated"));
    }

    @PostMapping("/vendors/{id}/performance")
    @Operation(summary = "Record vendor performance and SLA compliance")
    public ResponseEntity<ApiResponse<Map<String, Object>>> recordVendorPerformance(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        Vendor v = procurementService.recordVendorPerformance(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toVendorDto(v), "Vendor performance recorded"));
    }

    // --- Vendor obligations ---

    @PostMapping("/vendors/{id}/obligations")
    @Operation(summary = "Add an obligation/deliverable to a vendor")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addObligation(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        VendorObligation o = procurementService.addObligation(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toObligationDto(o), "Obligation added"));
    }

    @PutMapping("/obligations/{id}")
    @Operation(summary = "Update a vendor obligation")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateObligation(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        VendorObligation o = procurementService.updateObligation(id, body, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toObligationDto(o), "Obligation updated"));
    }

    @PostMapping("/obligations/{id}/status")
    @Operation(summary = "Change a vendor obligation's status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> changeObligationStatus(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        Object statusRaw = body == null ? null : body.get("status");
        if (statusRaw == null) {
            throw new BusinessRuleViolationException("A target status is required.");
        }
        ObligationStatus status;
        try {
            status = ObligationStatus.valueOf(String.valueOf(statusRaw).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid obligation status: " + statusRaw);
        }
        VendorObligation o = procurementService.changeObligationStatus(id, status, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toObligationDto(o), "Obligation status updated"));
    }

    @DeleteMapping("/obligations/{id}")
    @Operation(summary = "Delete a vendor obligation")
    public ResponseEntity<ApiResponse<String>> deleteObligation(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        procurementService.deleteObligation(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success("Obligation deleted"));
    }

    // --- Documents ---

    @GetMapping("/documents")
    @Operation(summary = "List documents (optional status filter)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getDocuments(
            @RequestParam(required = false) DocumentStatus status,
            @AuthenticationPrincipal UserDetails userDetails) {
        List<Document> docs = status == null
                ? documentRepository.findAll()
                : documentRepository.findByStatus(status);
        List<Document> visible = documentAccessPolicy.filterViewable(resolveUser(userDetails), docs);
        List<Map<String, Object>> result = visible.stream().map(this::toDocumentDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Documents retrieved"));
    }

    @PostMapping("/documents/{id}/approve")
    @Operation(summary = "Approve a document pending review")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approveDocument(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        Document doc = procurementService.approveDocument(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toDocumentDto(doc), "Document approved"));
    }

    // --- Legal cases (read-only) ---

    @GetMapping("/legal-cases")
    @Operation(summary = "List legal cases (read-only, limited legal visibility)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getLegalCases() {
        List<Map<String, Object>> result = legalCaseRepository.findAllByOrderByCreatedAtDesc()
                .stream().map(this::toCaseDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Legal cases retrieved"));
    }

    // --- Procurement notices ---

    @GetMapping("/notices")
    @Operation(summary = "List active procurement notices (regenerated on each call)")
    @Transactional
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getNotices() {
        procurementService.generateNotices();
        List<Map<String, Object>> result = procurementNoticeRepository
                .findByStatusInOrderByCreatedAtDesc(List.of(NoticeStatus.OPEN, NoticeStatus.ACKNOWLEDGED)).stream()
                .map(this::toNoticeDto).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Notices retrieved"));
    }

    @PostMapping("/notices/{id}/acknowledge")
    @Operation(summary = "Acknowledge a procurement notice")
    public ResponseEntity<ApiResponse<Map<String, Object>>> acknowledgeNotice(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        ProcurementNotice notice = procurementService.acknowledgeNotice(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toNoticeDto(notice), "Notice acknowledged"));
    }

    @PostMapping("/notices/{id}/dismiss")
    @Operation(summary = "Dismiss a procurement notice")
    public ResponseEntity<ApiResponse<Map<String, Object>>> dismissNotice(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        ProcurementNotice notice = procurementService.dismissNotice(id, resolveUser(userDetails));
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
        m.put("vendorId", c.getVendorId());
        m.put("vendorName", resolveVendorName(c.getVendorId()));
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

    private Map<String, Object> toVendorDto(Vendor v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", v.getId());
        m.put("vendorCode", v.getVendorCode());
        m.put("name", v.getName());
        m.put("category", v.getCategory());
        m.put("contactName", v.getContactName());
        m.put("contactEmail", v.getContactEmail());
        m.put("contactPhone", v.getContactPhone());
        m.put("address", v.getAddress());
        m.put("status", v.getStatus());
        m.put("performanceScore", v.getPerformanceScore());
        m.put("slaComplianceRate", v.getSlaComplianceRate());
        m.put("notes", v.getNotes());
        m.put("createdAt", v.getCreatedAt());
        return m;
    }

    private Map<String, Object> toObligationDto(VendorObligation o) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", o.getId());
        m.put("vendorId", o.getVendor() != null ? o.getVendor().getId() : null);
        m.put("title", o.getTitle());
        m.put("description", o.getDescription());
        m.put("dueDate", o.getDueDate());
        m.put("status", o.getStatus());
        m.put("notes", o.getNotes());
        m.put("createdAt", o.getCreatedAt());
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

    private Map<String, Object> toCaseDto(LegalCase c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("caseNumber", c.getCaseNumber());
        m.put("title", c.getTitle());
        m.put("description", c.getDescription());
        m.put("courtName", c.getCourtName());
        m.put("opposingParty", c.getOpposingParty());
        m.put("caseType", c.getCaseType());
        m.put("status", c.getStatus());
        m.put("priority", c.getPriority());
        m.put("filingDate", c.getFilingDate());
        m.put("expectedResolutionDate", c.getExpectedResolutionDate());
        m.put("createdAt", c.getCreatedAt());
        return m;
    }

    private Map<String, Object> toNoticeDto(ProcurementNotice a) {
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

    private String resolveVendorName(UUID vendorId) {
        if (vendorId == null) return null;
        return vendorRepository.findById(vendorId).map(Vendor::getName).orElse(null);
    }

    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) return null;
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }
}
