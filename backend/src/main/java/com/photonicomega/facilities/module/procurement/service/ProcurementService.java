package com.photonicomega.facilities.module.procurement.service;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.service.AuditService;
import com.photonicomega.facilities.module.contracts.domain.Contract;
import com.photonicomega.facilities.module.contracts.domain.ContractClause;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.domain.ContractType;
import com.photonicomega.facilities.module.contracts.domain.RiskLevel;
import com.photonicomega.facilities.module.contracts.repository.ContractClauseRepository;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.procurement.domain.*;
import com.photonicomega.facilities.module.procurement.repository.ProcurementNoticeRepository;
import com.photonicomega.facilities.module.procurement.repository.VendorObligationRepository;
import com.photonicomega.facilities.module.procurement.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Business logic for the Contract / Procurement Officer: full contract
 * lifecycle management (draft/review/approve/activate/renew/terminate + clause
 * management), vendor/supplier management with performance + SLA tracking,
 * vendor obligation/deliverable tracking, document approval, and generation of
 * stateful procurement notices. All mutations are recorded via
 * {@link AuditService} under the PROCUREMENT module.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProcurementService {

    private static final int EXPIRY_WINDOW_DAYS = 30;
    private static final int RENEWAL_WINDOW_DAYS = 30;
    private static final int OBLIGATION_DUE_SOON_DAYS = 14;
    private static final int SLA_MIN = 90;
    private static final int PERF_MIN = 60;
    private static final String MODULE = "PROCUREMENT";

    private final ContractRepository contractRepository;
    private final ContractClauseRepository contractClauseRepository;
    private final VendorRepository vendorRepository;
    private final VendorObligationRepository vendorObligationRepository;
    private final ProcurementNoticeRepository procurementNoticeRepository;
    private final DocumentRepository documentRepository;
    private final AuditService auditService;

    // --- Contract lifecycle ---

    @Transactional
    public Contract createContract(Map<String, Object> body, User user) {
        String title = str(body.get("title"));
        if (title == null || title.isBlank()) {
            throw new BusinessRuleViolationException("Contract title is required.");
        }
        String number = str(body.get("contractNumber"));
        if (number == null || number.isBlank()) {
            number = "CTR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        }
        final String contractNumber = number;
        contractRepository.findByContractNumber(contractNumber).ifPresent(c -> {
            throw new BusinessRuleViolationException("A contract with number '" + contractNumber + "' already exists.");
        });
        Contract contract = Contract.builder()
                .contractNumber(contractNumber)
                .title(title)
                .type(parseType(body.get("type")))
                .counterParty(str(body.get("counterParty")))
                .contractValue(decimalVal(body.get("contractValue")))
                .vendorId(parseUuid(body.get("vendorId")))
                .startDate(parseDate(body.get("startDate")))
                .endDate(parseDate(body.get("endDate")))
                .renewalNoticeDate(parseDate(body.get("renewalNoticeDate")))
                .status(ContractStatus.DRAFT)
                .aiAssessedRiskLevel(parseRisk(body.get("aiAssessedRiskLevel")))
                .aiRiskSummary(str(body.get("aiRiskSummary")))
                .build();
        Contract saved = contractRepository.save(contract);
        auditService.log(user, "CREATE_CONTRACT", MODULE, "Contract", saved.getId().toString(),
                "Created contract: " + title, null);
        return saved;
    }

    @Transactional
    public Contract updateContract(UUID id, Map<String, Object> body, User user) {
        Contract c = getContract(id);
        if (body.containsKey("title") && str(body.get("title")) != null) c.setTitle(str(body.get("title")));
        if (body.containsKey("type")) c.setType(parseType(body.get("type")));
        if (body.containsKey("counterParty")) c.setCounterParty(str(body.get("counterParty")));
        if (body.containsKey("contractValue")) c.setContractValue(decimalVal(body.get("contractValue")));
        if (body.containsKey("vendorId")) c.setVendorId(parseUuid(body.get("vendorId")));
        if (body.containsKey("startDate")) c.setStartDate(parseDate(body.get("startDate")));
        if (body.containsKey("endDate")) c.setEndDate(parseDate(body.get("endDate")));
        if (body.containsKey("renewalNoticeDate")) c.setRenewalNoticeDate(parseDate(body.get("renewalNoticeDate")));
        if (body.containsKey("aiAssessedRiskLevel")) c.setAiAssessedRiskLevel(parseRisk(body.get("aiAssessedRiskLevel")));
        if (body.containsKey("aiRiskSummary")) c.setAiRiskSummary(str(body.get("aiRiskSummary")));
        Contract saved = contractRepository.save(c);
        auditService.log(user, "UPDATE_CONTRACT", MODULE, "Contract", id.toString(),
                "Updated contract: " + c.getTitle(), null);
        return saved;
    }

    @Transactional
    public Contract submitForReview(UUID id, User user) {
        Contract c = getContract(id);
        if (c.getStatus() != ContractStatus.DRAFT) {
            throw new BusinessRuleViolationException("Only draft contracts can be submitted for review.");
        }
        return transition(c, ContractStatus.UNDER_REVIEW, "SUBMIT_CONTRACT_REVIEW",
                "Submitted contract for review: " + c.getTitle(), user);
    }

    @Transactional
    public Contract approveContract(UUID id, User user) {
        Contract c = getContract(id);
        if (c.getStatus() != ContractStatus.UNDER_REVIEW) {
            throw new BusinessRuleViolationException("Only contracts under review can be approved.");
        }
        return transition(c, ContractStatus.APPROVED, "APPROVE_CONTRACT",
                "Approved contract: " + c.getTitle(), user);
    }

    @Transactional
    public Contract activateContract(UUID id, User user) {
        Contract c = getContract(id);
        if (c.getStatus() != ContractStatus.APPROVED) {
            throw new BusinessRuleViolationException("Only approved contracts can be activated.");
        }
        return transition(c, ContractStatus.ACTIVE, "ACTIVATE_CONTRACT",
                "Activated contract: " + c.getTitle(), user);
    }

    @Transactional
    public Contract renewContract(UUID id, Map<String, Object> body, User user) {
        Contract c = getContract(id);
        if (c.getStatus() != ContractStatus.ACTIVE && c.getStatus() != ContractStatus.EXPIRED) {
            throw new BusinessRuleViolationException("Only active or expired contracts can be renewed.");
        }
        LocalDate newEnd = parseDate(body == null ? null : body.get("endDate"));
        if (newEnd != null) c.setEndDate(newEnd);
        LocalDate newRenewal = parseDate(body == null ? null : body.get("renewalNoticeDate"));
        if (newRenewal != null) c.setRenewalNoticeDate(newRenewal);
        return transition(c, ContractStatus.RENEWED, "RENEW_CONTRACT",
                "Renewed contract: " + c.getTitle(), user);
    }

    @Transactional
    public Contract terminateContract(UUID id, User user) {
        Contract c = getContract(id);
        if (c.getStatus() == ContractStatus.TERMINATED) {
            throw new BusinessRuleViolationException("Contract is already terminated.");
        }
        return transition(c, ContractStatus.TERMINATED, "TERMINATE_CONTRACT",
                "Terminated contract: " + c.getTitle(), user);
    }

    private Contract transition(Contract c, ContractStatus target, String action, String description, User user) {
        c.setStatus(target);
        Contract saved = contractRepository.save(c);
        auditService.log(user, action, MODULE, "Contract", c.getId().toString(), description, null);
        return saved;
    }

    // --- Contract clauses ---

    @Transactional
    public ContractClause addClause(UUID contractId, Map<String, Object> body, User user) {
        Contract c = getContract(contractId);
        String clauseType = str(body.get("clauseType"));
        String content = str(body.get("content"));
        if (clauseType == null || clauseType.isBlank() || content == null || content.isBlank()) {
            throw new BusinessRuleViolationException("Clause type and content are required.");
        }
        ContractClause clause = ContractClause.builder()
                .contract(c)
                .clauseType(clauseType)
                .content(content)
                .riskLevel(parseRisk(body.get("riskLevel")))
                .aiAnalysisNotes(str(body.get("aiAnalysisNotes")))
                .build();
        ContractClause saved = contractClauseRepository.save(clause);
        auditService.log(user, "ADD_CLAUSE", MODULE, "ContractClause", saved.getId().toString(),
                "Added clause '" + clauseType + "' to contract: " + c.getTitle(), null);
        return saved;
    }

    @Transactional
    public ContractClause updateClause(UUID clauseId, Map<String, Object> body, User user) {
        ContractClause clause = contractClauseRepository.findById(clauseId)
                .orElseThrow(() -> new ResourceNotFoundException("ContractClause", "id", clauseId));
        if (body.containsKey("clauseType") && str(body.get("clauseType")) != null)
            clause.setClauseType(str(body.get("clauseType")));
        if (body.containsKey("content") && str(body.get("content")) != null)
            clause.setContent(str(body.get("content")));
        if (body.containsKey("riskLevel")) clause.setRiskLevel(parseRisk(body.get("riskLevel")));
        if (body.containsKey("aiAnalysisNotes")) clause.setAiAnalysisNotes(str(body.get("aiAnalysisNotes")));
        ContractClause saved = contractClauseRepository.save(clause);
        auditService.log(user, "UPDATE_CLAUSE", MODULE, "ContractClause", clauseId.toString(),
                "Updated clause: " + clause.getClauseType(), null);
        return saved;
    }

    @Transactional
    public void deleteClause(UUID clauseId, User user) {
        ContractClause clause = contractClauseRepository.findById(clauseId)
                .orElseThrow(() -> new ResourceNotFoundException("ContractClause", "id", clauseId));
        contractClauseRepository.delete(clause);
        auditService.log(user, "DELETE_CLAUSE", MODULE, "ContractClause", clauseId.toString(),
                "Deleted clause: " + clause.getClauseType(), null);
    }

    // --- Vendors ---

    @Transactional
    public Vendor createVendor(Map<String, Object> body, User user) {
        String name = str(body.get("name"));
        if (name == null || name.isBlank()) {
            throw new BusinessRuleViolationException("Vendor name is required.");
        }
        String code = str(body.get("vendorCode"));
        if (code == null || code.isBlank()) {
            code = "VND-" + UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        }
        final String vendorCode = code;
        vendorRepository.findByVendorCode(vendorCode).ifPresent(v -> {
            throw new BusinessRuleViolationException("A vendor with code '" + vendorCode + "' already exists.");
        });
        Vendor vendor = Vendor.builder()
                .vendorCode(vendorCode)
                .name(name)
                .category(parseCategory(body.get("category")))
                .contactName(str(body.get("contactName")))
                .contactEmail(str(body.get("contactEmail")))
                .contactPhone(str(body.get("contactPhone")))
                .address(str(body.get("address")))
                .status(parseVendorStatus(body.get("status"), VendorStatus.ACTIVE))
                .performanceScore(intVal(body.get("performanceScore")))
                .slaComplianceRate(decimalVal(body.get("slaComplianceRate")))
                .notes(str(body.get("notes")))
                .build();
        Vendor saved = vendorRepository.save(vendor);
        auditService.log(user, "CREATE_VENDOR", MODULE, "Vendor", saved.getId().toString(),
                "Created vendor: " + name, null);
        return saved;
    }

    @Transactional
    public Vendor updateVendor(UUID id, Map<String, Object> body, User user) {
        Vendor v = getVendor(id);
        if (body.containsKey("name") && str(body.get("name")) != null) v.setName(str(body.get("name")));
        if (body.containsKey("category")) v.setCategory(parseCategory(body.get("category")));
        if (body.containsKey("contactName")) v.setContactName(str(body.get("contactName")));
        if (body.containsKey("contactEmail")) v.setContactEmail(str(body.get("contactEmail")));
        if (body.containsKey("contactPhone")) v.setContactPhone(str(body.get("contactPhone")));
        if (body.containsKey("address")) v.setAddress(str(body.get("address")));
        if (body.containsKey("notes")) v.setNotes(str(body.get("notes")));
        Vendor saved = vendorRepository.save(v);
        auditService.log(user, "UPDATE_VENDOR", MODULE, "Vendor", id.toString(),
                "Updated vendor: " + v.getName(), null);
        return saved;
    }

    @Transactional
    public Vendor changeVendorStatus(UUID id, VendorStatus status, User user) {
        Vendor v = getVendor(id);
        v.setStatus(status);
        Vendor saved = vendorRepository.save(v);
        auditService.log(user, "CHANGE_VENDOR_STATUS", MODULE, "Vendor", id.toString(),
                "Set vendor '" + v.getName() + "' status=" + status, null);
        return saved;
    }

    @Transactional
    public Vendor recordVendorPerformance(UUID id, Map<String, Object> body, User user) {
        Vendor v = getVendor(id);
        if (body.containsKey("performanceScore")) v.setPerformanceScore(intVal(body.get("performanceScore")));
        if (body.containsKey("slaComplianceRate")) v.setSlaComplianceRate(decimalVal(body.get("slaComplianceRate")));
        if (body.containsKey("notes") && str(body.get("notes")) != null) v.setNotes(str(body.get("notes")));
        Vendor saved = vendorRepository.save(v);
        auditService.log(user, "RECORD_VENDOR_PERFORMANCE", MODULE, "Vendor", id.toString(),
                "Recorded performance for vendor: " + v.getName()
                        + " (score=" + v.getPerformanceScore() + ", sla=" + v.getSlaComplianceRate() + ")", null);
        return saved;
    }

    // --- Vendor obligations ---

    @Transactional
    public VendorObligation addObligation(UUID vendorId, Map<String, Object> body, User user) {
        Vendor v = getVendor(vendorId);
        String title = str(body.get("title"));
        if (title == null || title.isBlank()) {
            throw new BusinessRuleViolationException("Obligation title is required.");
        }
        VendorObligation obligation = VendorObligation.builder()
                .vendor(v)
                .title(title)
                .description(str(body.get("description")))
                .dueDate(parseDate(body.get("dueDate")))
                .status(parseObligationStatus(body.get("status"), ObligationStatus.PENDING))
                .notes(str(body.get("notes")))
                .build();
        VendorObligation saved = vendorObligationRepository.save(obligation);
        auditService.log(user, "ADD_OBLIGATION", MODULE, "VendorObligation", saved.getId().toString(),
                "Added obligation '" + title + "' for vendor: " + v.getName(), null);
        return saved;
    }

    @Transactional
    public VendorObligation updateObligation(UUID obligationId, Map<String, Object> body, User user) {
        VendorObligation o = getObligation(obligationId);
        if (body.containsKey("title") && str(body.get("title")) != null) o.setTitle(str(body.get("title")));
        if (body.containsKey("description")) o.setDescription(str(body.get("description")));
        if (body.containsKey("dueDate")) o.setDueDate(parseDate(body.get("dueDate")));
        if (body.containsKey("notes")) o.setNotes(str(body.get("notes")));
        VendorObligation saved = vendorObligationRepository.save(o);
        auditService.log(user, "UPDATE_OBLIGATION", MODULE, "VendorObligation", obligationId.toString(),
                "Updated obligation: " + o.getTitle(), null);
        return saved;
    }

    @Transactional
    public VendorObligation changeObligationStatus(UUID obligationId, ObligationStatus status, User user) {
        VendorObligation o = getObligation(obligationId);
        o.setStatus(status);
        VendorObligation saved = vendorObligationRepository.save(o);
        auditService.log(user, "CHANGE_OBLIGATION_STATUS", MODULE, "VendorObligation", obligationId.toString(),
                "Set obligation '" + o.getTitle() + "' status=" + status, null);
        return saved;
    }

    @Transactional
    public void deleteObligation(UUID obligationId, User user) {
        VendorObligation o = getObligation(obligationId);
        vendorObligationRepository.delete(o);
        auditService.log(user, "DELETE_OBLIGATION", MODULE, "VendorObligation", obligationId.toString(),
                "Deleted obligation: " + o.getTitle(), null);
    }

    // --- Document approval (Procurement has C/R/U on documents) ---

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

    // --- Procurement notices ---

    /**
     * Scans contracts, vendors, and vendor obligations and upserts notices by
     * dedupKey. Idempotent: existing notices keep their acknowledge/dismiss state.
     */
    @Transactional
    public void generateNotices() {
        LocalDate today = LocalDate.now();

        for (Contract c : contractRepository.findByStatus(ContractStatus.UNDER_REVIEW)) {
            upsertNotice("CONTRACT_PENDING_REVIEW:" + c.getId(), NoticeType.CONTRACT_PENDING_REVIEW,
                    NoticeSeverity.INFO, "Contract pending review: " + c.getTitle(),
                    c.getContractNumber() + " with " + c.getCounterParty() + " awaits review.",
                    "Contract", c.getId().toString());
        }
        for (Contract c : contractRepository.findExpiringContractsBefore(today.plusDays(EXPIRY_WINDOW_DAYS))) {
            upsertNotice("CONTRACT_EXPIRING:" + c.getId(), NoticeType.CONTRACT_EXPIRING, NoticeSeverity.WARNING,
                    "Contract expiring soon: " + c.getTitle(),
                    c.getContractNumber() + " with " + c.getCounterParty() + " ends " + c.getEndDate() + ".",
                    "Contract", c.getId().toString());
        }
        for (Contract c : contractRepository.findByStatus(ContractStatus.EXPIRED)) {
            upsertNotice("CONTRACT_EXPIRED:" + c.getId(), NoticeType.CONTRACT_EXPIRED, NoticeSeverity.CRITICAL,
                    "Contract expired: " + c.getTitle(),
                    c.getContractNumber() + " with " + c.getCounterParty() + " expired on " + c.getEndDate() + ".",
                    "Contract", c.getId().toString());
        }
        for (Contract c : contractRepository.findByStatus(ContractStatus.ACTIVE)) {
            LocalDate renewal = c.getRenewalNoticeDate();
            if (renewal != null && !renewal.isBefore(today) && !renewal.isAfter(today.plusDays(RENEWAL_WINDOW_DAYS))) {
                upsertNotice("CONTRACT_RENEWAL_DUE:" + c.getId(), NoticeType.CONTRACT_RENEWAL_DUE,
                        NoticeSeverity.WARNING, "Contract renewal decision due: " + c.getTitle(),
                        c.getContractNumber() + " renewal notice date is " + renewal + ".",
                        "Contract", c.getId().toString());
            }
        }
        for (Vendor v : vendorRepository.findAll()) {
            if (v.getSlaComplianceRate() != null
                    && v.getSlaComplianceRate().compareTo(BigDecimal.valueOf(SLA_MIN)) < 0) {
                upsertNotice("VENDOR_SLA_BREACH:" + v.getId(), NoticeType.VENDOR_SLA_BREACH, NoticeSeverity.CRITICAL,
                        "Vendor SLA breach: " + v.getName(),
                        v.getVendorCode() + " SLA compliance is " + v.getSlaComplianceRate() + "% (min " + SLA_MIN + "%).",
                        "Vendor", v.getId().toString());
            }
            if (v.getPerformanceScore() != null && v.getPerformanceScore() < PERF_MIN) {
                upsertNotice("VENDOR_LOW_PERFORMANCE:" + v.getId(), NoticeType.VENDOR_LOW_PERFORMANCE,
                        NoticeSeverity.WARNING, "Vendor low performance: " + v.getName(),
                        v.getVendorCode() + " performance score is " + v.getPerformanceScore() + " (min " + PERF_MIN + ").",
                        "Vendor", v.getId().toString());
            }
        }
        for (VendorObligation o : vendorObligationRepository.findAll()) {
            if (o.getStatus() == ObligationStatus.COMPLETED || o.getDueDate() == null) continue;
            String vendorName = o.getVendor() != null ? o.getVendor().getName() : "a vendor";
            if (o.getDueDate().isBefore(today)) {
                upsertNotice("OBLIGATION_OVERDUE:" + o.getId(), NoticeType.OBLIGATION_OVERDUE, NoticeSeverity.CRITICAL,
                        "Obligation overdue: " + o.getTitle(),
                        "'" + o.getTitle() + "' for " + vendorName + " was due " + o.getDueDate() + ".",
                        "VendorObligation", o.getId().toString());
            } else if (!o.getDueDate().isAfter(today.plusDays(OBLIGATION_DUE_SOON_DAYS))) {
                upsertNotice("OBLIGATION_DUE_SOON:" + o.getId(), NoticeType.OBLIGATION_DUE_SOON, NoticeSeverity.WARNING,
                        "Obligation due soon: " + o.getTitle(),
                        "'" + o.getTitle() + "' for " + vendorName + " is due " + o.getDueDate() + ".",
                        "VendorObligation", o.getId().toString());
            }
        }
    }

    private void upsertNotice(String dedupKey, NoticeType type, NoticeSeverity severity,
                              String title, String message, String entityType, String entityId) {
        if (procurementNoticeRepository.findByDedupKey(dedupKey).isPresent()) {
            return; // Preserve existing state (acknowledged/dismissed).
        }
        procurementNoticeRepository.save(ProcurementNotice.builder()
                .type(type)
                .severity(severity)
                .title(title)
                .message(message)
                .entityType(entityType)
                .entityId(entityId)
                .status(NoticeStatus.OPEN)
                .dedupKey(dedupKey)
                .build());
    }

    @Transactional
    public ProcurementNotice acknowledgeNotice(UUID id, User user) {
        ProcurementNotice notice = procurementNoticeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("ProcurementNotice", "id", id));
        notice.setStatus(NoticeStatus.ACKNOWLEDGED);
        notice.setAcknowledgedBy(user != null ? user.getEmail() : null);
        notice.setAcknowledgedAt(LocalDateTime.now());
        ProcurementNotice saved = procurementNoticeRepository.save(notice);
        auditService.log(user, "ACKNOWLEDGE_NOTICE", MODULE, "ProcurementNotice", id.toString(),
                "Acknowledged notice: " + notice.getTitle(), null);
        return saved;
    }

    @Transactional
    public ProcurementNotice dismissNotice(UUID id, User user) {
        ProcurementNotice notice = procurementNoticeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("ProcurementNotice", "id", id));
        notice.setStatus(NoticeStatus.DISMISSED);
        ProcurementNotice saved = procurementNoticeRepository.save(notice);
        auditService.log(user, "DISMISS_NOTICE", MODULE, "ProcurementNotice", id.toString(),
                "Dismissed notice: " + notice.getTitle(), null);
        return saved;
    }

    // --- lookups ---

    private Contract getContract(UUID id) {
        return contractRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Contract", "id", id));
    }

    private Vendor getVendor(UUID id) {
        return vendorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Vendor", "id", id));
    }

    private VendorObligation getObligation(UUID id) {
        return vendorObligationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("VendorObligation", "id", id));
    }

    // --- value-coercion helpers ---

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Integer intVal(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        if (s.isEmpty()) return null;
        try {
            return Integer.valueOf(new BigDecimal(s).intValue());
        } catch (NumberFormatException e) {
            throw new BusinessRuleViolationException("Invalid integer value: " + o);
        }
    }

    private static BigDecimal decimalVal(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        if (s.isEmpty()) return null;
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            throw new BusinessRuleViolationException("Invalid numeric value: " + o);
        }
    }

    private static UUID parseUuid(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        if (s.isEmpty()) return null;
        try {
            return UUID.fromString(s);
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid vendor id: " + o);
        }
    }

    private static LocalDate parseDate(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        if (s.isEmpty()) return null;
        try {
            return LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s);
        } catch (Exception e) {
            throw new BusinessRuleViolationException("Invalid date: " + o);
        }
    }

    private static ContractType parseType(Object o) {
        if (o == null) return ContractType.VENDOR_SERVICE;
        try {
            return ContractType.valueOf(String.valueOf(o).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid contract type: " + o);
        }
    }

    private static RiskLevel parseRisk(Object o) {
        if (o == null) return null;
        try {
            return RiskLevel.valueOf(String.valueOf(o).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid risk level: " + o);
        }
    }

    private static VendorCategory parseCategory(Object o) {
        if (o == null) return VendorCategory.OTHER;
        try {
            return VendorCategory.valueOf(String.valueOf(o).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid vendor category: " + o);
        }
    }

    private static VendorStatus parseVendorStatus(Object o, VendorStatus fallback) {
        if (o == null) return fallback;
        try {
            return VendorStatus.valueOf(String.valueOf(o).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid vendor status: " + o);
        }
    }

    private static ObligationStatus parseObligationStatus(Object o, ObligationStatus fallback) {
        if (o == null) return fallback;
        try {
            return ObligationStatus.valueOf(String.valueOf(o).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid obligation status: " + o);
        }
    }
}
