package com.photonicomega.facilities.module.legal.service;

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
import com.photonicomega.facilities.module.legal.domain.*;
import com.photonicomega.facilities.module.legal.repository.LegalCaseRepository;
import com.photonicomega.facilities.module.legal.repository.LegalNoticeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Business logic for the Legal Officer: full contract lifecycle management
 * (draft/review/approve/activate/renew/terminate + clause management), legal
 * case management, document approval, and generation of stateful legal
 * notices. All mutations are recorded via {@link AuditService}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class LegalService {

    private static final int EXPIRY_WINDOW_DAYS = 30;
    private static final int RENEWAL_WINDOW_DAYS = 30;
    private static final String MODULE = "LEGAL";

    private static final Set<CaseStatus> CLOSED_CASE_STATUSES =
            EnumSet.of(CaseStatus.SETTLED, CaseStatus.CLOSED);

    private final ContractRepository contractRepository;
    private final ContractClauseRepository contractClauseRepository;
    private final LegalCaseRepository legalCaseRepository;
    private final LegalNoticeRepository legalNoticeRepository;
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

    // --- Legal cases ---

    @Transactional
    public LegalCase createCase(Map<String, Object> body, User user) {
        String title = str(body.get("title"));
        if (title == null || title.isBlank()) {
            throw new BusinessRuleViolationException("Case title is required.");
        }
        String number = str(body.get("caseNumber"));
        if (number == null || number.isBlank()) {
            number = "CASE-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        }
        final String caseNumber = number;
        legalCaseRepository.findByCaseNumber(caseNumber).ifPresent(x -> {
            throw new BusinessRuleViolationException("A case with number '" + caseNumber + "' already exists.");
        });
        LegalCase legalCase = LegalCase.builder()
                .caseNumber(caseNumber)
                .title(title)
                .description(str(body.get("description")))
                .courtName(str(body.get("courtName")))
                .judgeName(str(body.get("judgeName")))
                .opposingParty(str(body.get("opposingParty")))
                .caseType(parseCaseType(body.get("caseType")))
                .status(parseCaseStatus(body.get("status"), CaseStatus.OPEN))
                .priority(parseCasePriority(body.get("priority"), CasePriority.MEDIUM))
                .filingDate(parseDate(body.get("filingDate")))
                .expectedResolutionDate(parseDate(body.get("expectedResolutionDate")))
                .build();
        LegalCase saved = legalCaseRepository.save(legalCase);
        auditService.log(user, "CREATE_CASE", MODULE, "LegalCase", saved.getId().toString(),
                "Created legal case: " + title, null);
        return saved;
    }

    @Transactional
    public LegalCase updateCase(UUID id, Map<String, Object> body, User user) {
        LegalCase c = getCase(id);
        if (body.containsKey("title") && str(body.get("title")) != null) c.setTitle(str(body.get("title")));
        if (body.containsKey("description")) c.setDescription(str(body.get("description")));
        if (body.containsKey("courtName")) c.setCourtName(str(body.get("courtName")));
        if (body.containsKey("judgeName")) c.setJudgeName(str(body.get("judgeName")));
        if (body.containsKey("opposingParty")) c.setOpposingParty(str(body.get("opposingParty")));
        if (body.containsKey("caseType")) c.setCaseType(parseCaseType(body.get("caseType")));
        if (body.containsKey("priority")) c.setPriority(parseCasePriority(body.get("priority"), c.getPriority()));
        if (body.containsKey("filingDate")) c.setFilingDate(parseDate(body.get("filingDate")));
        if (body.containsKey("expectedResolutionDate"))
            c.setExpectedResolutionDate(parseDate(body.get("expectedResolutionDate")));
        LegalCase saved = legalCaseRepository.save(c);
        auditService.log(user, "UPDATE_CASE", MODULE, "LegalCase", id.toString(),
                "Updated legal case: " + c.getTitle(), null);
        return saved;
    }

    @Transactional
    public LegalCase changeCaseStatus(UUID id, CaseStatus status, String notes, User user) {
        LegalCase c = getCase(id);
        c.setStatus(status);
        if (notes != null && !notes.isBlank()) c.setResolutionNotes(notes);
        if (CLOSED_CASE_STATUSES.contains(status)) {
            c.setClosedDate(LocalDate.now());
        }
        LegalCase saved = legalCaseRepository.save(c);
        auditService.log(user, "CHANGE_CASE_STATUS", MODULE, "LegalCase", id.toString(),
                "Set case '" + c.getTitle() + "' status=" + status, null);
        return saved;
    }

    // --- Document approval (Legal has C/R/U on documents) ---

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

    // --- Legal notices ---

    /**
     * Scans contracts, contract clauses, and legal cases and upserts notices by
     * dedupKey. Idempotent: existing notices keep their acknowledge/dismiss state.
     */
    @Transactional
    public void generateNotices() {
        LocalDate today = LocalDate.now();

        for (Contract c : contractRepository.findByStatus(ContractStatus.UNDER_REVIEW)) {
            upsertNotice("CONTRACT_PENDING_REVIEW:" + c.getId(), NoticeType.CONTRACT_PENDING_REVIEW,
                    NoticeSeverity.INFO, "Contract pending review: " + c.getTitle(),
                    c.getContractNumber() + " with " + c.getCounterParty() + " awaits your review.",
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
        for (ContractClause clause : contractClauseRepository.findAll()) {
            if (clause.getRiskLevel() == RiskLevel.HIGH || clause.getRiskLevel() == RiskLevel.CRITICAL) {
                String contractTitle = clause.getContract() != null ? clause.getContract().getTitle() : "a contract";
                upsertNotice("HIGH_RISK_CLAUSE:" + clause.getId(), NoticeType.HIGH_RISK_CLAUSE,
                        clause.getRiskLevel() == RiskLevel.CRITICAL ? NoticeSeverity.CRITICAL : NoticeSeverity.WARNING,
                        clause.getRiskLevel() + "-risk clause: " + clause.getClauseType(),
                        "Clause '" + clause.getClauseType() + "' on " + contractTitle + " is flagged " + clause.getRiskLevel() + ".",
                        "ContractClause", clause.getId().toString());
            }
        }
        for (LegalCase c : legalCaseRepository.findByStatus(CaseStatus.PENDING_HEARING)) {
            upsertNotice("CASE_HEARING_DUE:" + c.getId(), NoticeType.CASE_HEARING_DUE, NoticeSeverity.WARNING,
                    "Case awaiting hearing: " + c.getTitle(),
                    c.getCaseNumber() + " is pending hearing" + (c.getCourtName() != null ? " at " + c.getCourtName() : "") + ".",
                    "LegalCase", c.getId().toString());
        }
        for (LegalCase c : legalCaseRepository.findByPriority(CasePriority.CRITICAL)) {
            if (!CLOSED_CASE_STATUSES.contains(c.getStatus())) {
                upsertNotice("CASE_HIGH_PRIORITY:" + c.getId(), NoticeType.CASE_HIGH_PRIORITY, NoticeSeverity.CRITICAL,
                        "Critical-priority case: " + c.getTitle(),
                        c.getCaseNumber() + " is flagged CRITICAL and remains open.",
                        "LegalCase", c.getId().toString());
            }
        }
    }

    private void upsertNotice(String dedupKey, NoticeType type, NoticeSeverity severity,
                              String title, String message, String entityType, String entityId) {
        if (legalNoticeRepository.findByDedupKey(dedupKey).isPresent()) {
            return; // Preserve existing state (acknowledged/dismissed).
        }
        legalNoticeRepository.save(LegalNotice.builder()
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
    public LegalNotice acknowledgeNotice(UUID id, User user) {
        LegalNotice notice = legalNoticeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("LegalNotice", "id", id));
        notice.setStatus(NoticeStatus.ACKNOWLEDGED);
        notice.setAcknowledgedBy(user != null ? user.getEmail() : null);
        notice.setAcknowledgedAt(LocalDateTime.now());
        LegalNotice saved = legalNoticeRepository.save(notice);
        auditService.log(user, "ACKNOWLEDGE_NOTICE", MODULE, "LegalNotice", id.toString(),
                "Acknowledged notice: " + notice.getTitle(), null);
        return saved;
    }

    @Transactional
    public LegalNotice dismissNotice(UUID id, User user) {
        LegalNotice notice = legalNoticeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("LegalNotice", "id", id));
        notice.setStatus(NoticeStatus.DISMISSED);
        LegalNotice saved = legalNoticeRepository.save(notice);
        auditService.log(user, "DISMISS_NOTICE", MODULE, "LegalNotice", id.toString(),
                "Dismissed notice: " + notice.getTitle(), null);
        return saved;
    }

    // --- lookups ---

    private Contract getContract(UUID id) {
        return contractRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Contract", "id", id));
    }

    private LegalCase getCase(UUID id) {
        return legalCaseRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("LegalCase", "id", id));
    }

    // --- value-coercion helpers ---

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static BigDecimal decimalVal(Object o) {
        if (o == null) return null;
        try {
            return new BigDecimal(String.valueOf(o));
        } catch (NumberFormatException e) {
            throw new BusinessRuleViolationException("Invalid numeric value: " + o);
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

    private static CaseType parseCaseType(Object o) {
        if (o == null) return CaseType.OTHER;
        try {
            return CaseType.valueOf(String.valueOf(o).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid case type: " + o);
        }
    }

    private static CaseStatus parseCaseStatus(Object o, CaseStatus fallback) {
        if (o == null) return fallback;
        try {
            return CaseStatus.valueOf(String.valueOf(o).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid case status: " + o);
        }
    }

    private static CasePriority parseCasePriority(Object o, CasePriority fallback) {
        if (o == null) return fallback;
        try {
            return CasePriority.valueOf(String.valueOf(o).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid case priority: " + o);
        }
    }
}
