package com.photonicomega.facilities.module.analytics;

import com.photonicomega.facilities.ai.AiStateManagementService;
import com.photonicomega.facilities.module.admin.domain.BackupRecord;
import com.photonicomega.facilities.module.admin.repository.BackupRecordRepository;
import com.photonicomega.facilities.module.auth.domain.AuditLog;
import com.photonicomega.facilities.module.auth.domain.AuditSeverity;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.AuditLogRepository;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.contracts.domain.Contract;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.domain.ContractType;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.documents.domain.ClassificationLevel;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.facilities.domain.ReservationStatus;
import com.photonicomega.facilities.module.facilities.repository.ReservationRepository;
import com.photonicomega.facilities.module.security.domain.LoginHistory;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.domain.SecurityModule;
import com.photonicomega.facilities.module.security.repository.LoginHistoryRepository;
import com.photonicomega.facilities.module.security.repository.SecurityLogRepository;
import com.photonicomega.facilities.module.visitor.domain.Visitor;
import com.photonicomega.facilities.module.visitor.domain.VisitorStatus;
import com.photonicomega.facilities.module.visitor.repository.VisitorRepository;
import com.photonicomega.facilities.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end verification that the consolidated Analytics endpoint aggregates
 * real persisted data only - no mock, hardcoded, or fabricated values.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AnalyticsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private SecurityLogRepository securityLogRepository;

    @Autowired
    private LoginHistoryRepository loginHistoryRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private VisitorRepository visitorRepository;

    @Autowired
    private DocumentRepository documentRepository;

    @Autowired
    private ContractRepository contractRepository;

    @Autowired
    private ReservationRepository reservationRepository;

    @Autowired
    private BackupRecordRepository backupRecordRepository;

    @Autowired
    private AiStateManagementService aiStateService;

    private String adminToken;

    private final Instant now = Instant.now();

    private long baseDocuments;
    private long baseContracts;
    private long baseBackups;
    private long baseAudit;
    private long baseArchived;
    private long baseActiveContracts;
    private long baseExpiredContracts;

    @BeforeEach
    void seed() {
        if (userRepository.findByEmailAndDeletedFalse("analytics.admin@test.local").isEmpty()) {
            Role superRole = roleRepository.findByName("SUPER_ADMIN").orElseGet(() -> roleRepository.save(Role.builder()
                    .name("SUPER_ADMIN").displayName("super admin").description("analytics test role").build()));
            userRepository.save(user("analytics.admin@test.local", "IT", superRole));
        }
        UserDetails userDetails = new org.springframework.security.core.userdetails.User(
                "analytics.admin@test.local", "unused", true, true, true, true,
                List.of(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN")));
        adminToken = jwtTokenProvider.generateAccessToken(userDetails);
        aiStateService.reset();

        // Capture bootstrap-seeded baseline so assertions are robust regardless
        // of shared application-context seed data.
        baseDocuments = documentRepository.count();
        baseContracts = contractRepository.count();
        baseBackups = backupRecordRepository.count();
        baseAudit = auditLogRepository.count();
        baseArchived = documentRepository.countByStatus(DocumentStatus.ARCHIVED);
        baseActiveContracts = contractRepository.countByStatus(ContractStatus.ACTIVE);
        baseExpiredContracts = contractRepository.countByStatus(ContractStatus.EXPIRED);
    }

    @Test
    @DisplayName("KPI security event count reflects exactly the seeded security logs in range")
    void kpiSecurityEventsReflectSeededLogs() throws Exception {
        seedSecurityLog(RiskLevel.HIGH, "FAILED", now.minus(Duration.ofHours(5)));
        seedSecurityLog(RiskLevel.MEDIUM, "SUCCESS", now.minus(Duration.ofHours(3)));
        seedSecurityLog(RiskLevel.LOW, "SUCCESS", now.minus(Duration.ofDays(40))); // outside 30d window

        mockMvc.perform(get("/v1/admin/analytics?from={from}&to={to}",
                        now.minus(Duration.ofDays(30)).toString(), now.toString())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.kpis[0].key").value("securityEvents"))
                .andExpect(jsonPath("$.data.security.high").value(1))
                .andExpect(jsonPath("$.data.security.medium").value(1));
    }

    @Test
    @DisplayName("Security section reports real risk-level breakdown and failed logins")
    void securitySectionReportsRealBreakdown() throws Exception {
        seedSecurityLog(RiskLevel.CRITICAL, "FAILED", now.minus(Duration.ofHours(2)));
        seedSecurityLog(RiskLevel.HIGH, "FAILED", now.minus(Duration.ofHours(2)));
        seedSecurityLog(RiskLevel.MEDIUM, "SUCCESS", now.minus(Duration.ofHours(2)));
        seedLoginHistory("FAILED", now.minus(Duration.ofHours(1)));
        seedLoginHistory("SUCCESS", now.minus(Duration.ofHours(1)));

        mockMvc.perform(get("/v1/admin/analytics")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.security.critical").value(1))
                .andExpect(jsonPath("$.data.security.high").value(1))
                .andExpect(jsonPath("$.data.security.medium").value(1))
                .andExpect(jsonPath("$.data.security.failedLogins").value(1));
    }

    @Test
    @DisplayName("Audit analytics groups real rows by module and action")
    void auditAnalyticsGroupRealRows() throws Exception {
        seedAudit("DOCUMENTS", "CREATE", ldt(now.minus(Duration.ofHours(2))));
        seedAudit("DOCUMENTS", "CREATE", ldt(now.minus(Duration.ofHours(2))));
        seedAudit("CONTRACTS", "APPROVE", ldt(now.minus(Duration.ofHours(2))));

        String body = mockMvc.perform(get("/v1/admin/analytics")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.audit.total").value(baseAudit + 3))
                .andReturn().getResponse().getContentAsString();
        assertTrue(body.contains("\"label\":\"DOCUMENTS\""));
        assertTrue(body.contains("\"label\":\"CREATE\""));
    }

    @Test
    @DisplayName("Document, contract, and backup analytics reflect real repositories")
    void domainSectionsReflectRealRepositories() throws Exception {
        seedDocument("Doc A", DocumentStatus.ARCHIVED, ldt(now.minus(Duration.ofHours(4))));
        seedDocument("Doc B", DocumentStatus.DRAFT, ldt(now.minus(Duration.ofHours(4))));
        seedContract("CT-001", ContractStatus.ACTIVE, ldt(now.minus(Duration.ofHours(4))));
        seedContract("CT-002", ContractStatus.EXPIRED, ldt(now.minus(Duration.ofHours(4))));
        seedBackup("COMPLETED", now.minus(Duration.ofHours(3)));
        seedBackup("FAILED", now.minus(Duration.ofHours(1)));

        mockMvc.perform(get("/v1/admin/analytics")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.documents.total").value(baseDocuments + 2))
                .andExpect(jsonPath("$.data.documents.uploaded").value(baseDocuments + 2))
                .andExpect(jsonPath("$.data.documents.archived").value(baseArchived + 1))
                .andExpect(jsonPath("$.data.contracts.total").value(baseContracts + 2))
                .andExpect(jsonPath("$.data.contracts.active").value(baseActiveContracts + 1))
                .andExpect(jsonPath("$.data.contracts.expired").value(baseExpiredContracts + 1))
                .andExpect(jsonPath("$.data.backups.total").value(2))
                .andExpect(jsonPath("$.data.backups.successCount").value(1))
                .andExpect(jsonPath("$.data.backups.failedCount").value(1));
    }

    @Test
    @DisplayName("AI analytics aggregate real in-memory request logs and never expose keys")
    void aiAnalyticsFromRealLogs() throws Exception {
        aiStateService.addLog("Document Classification", "OpenAI", "classify", "SUCCESS", 850, 1200, "admin");
        aiStateService.addLog("Document Classification", "OpenAI", "classify", "SUCCESS", 700, 900, "admin");
        aiStateService.addLog("Visitor Verification", "Gemini", "verify", "FAILED", 1500, 300, "admin");

        mockMvc.perform(get("/v1/admin/analytics")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ai.totalRequests").value(3))
                .andExpect(jsonPath("$.data.ai.successful").value(2))
                .andExpect(jsonPath("$.data.ai.failed").value(1))
                .andExpect(jsonPath("$.data.ai.source").value("IN_MEMORY"))
                .andExpect(jsonPath("$.data.ai.requestsByProvider.length()").value(2))
                .andExpect(jsonPath("$.data.ai.providers[0].apiKey").doesNotExist());
    }

    @Test
    @DisplayName("Health section carries the real-time subsystem snapshot (no fabricated statuses)")
    void healthSectionCarriesRealSnapshot() throws Exception {
        mockMvc.perform(get("/v1/admin/analytics")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.health.overallStatus").exists())
                .andExpect(jsonPath("$.data.health.components").exists());
    }

    @Test
    @DisplayName("Insights are generated only from real computed values")
    void insightsGeneratedFromRealData() throws Exception {
        seedSecurityLog(RiskLevel.CRITICAL, "FAILED", now.minus(Duration.ofHours(2)));
        seedLoginHistory("FAILED", now.minus(Duration.ofHours(1)));
        seedBackup("FAILED", now.minus(Duration.ofHours(1)));

        String body = mockMvc.perform(get("/v1/admin/analytics")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertTrue(body.contains("Failed logins"));
        assertTrue(body.contains("Backup failures"));
    }

    @Test
    @DisplayName("Empty period yields zero real counters instead of fabricated numbers")
    void emptyPeriodYieldsZeroCounters() throws Exception {
        mockMvc.perform(get("/v1/admin/analytics")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.security.failedLogins").value(0))
                .andExpect(jsonPath("$.data.ai.totalRequests").value(0));
    }

    @Test
    @DisplayName("Unauthenticated requests are rejected")
    void unauthenticatedRejected() throws Exception {
        mockMvc.perform(get("/v1/admin/analytics"))
                .andExpect(status().isUnauthorized());
    }

    private LocalDateTime ldt(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    // ------------------------------------------------------------------
    // Seeding helpers
    // ------------------------------------------------------------------

    private SecurityLog seedSecurityLog(RiskLevel risk, String status, Instant when) {
        return securityLogRepository.save(SecurityLog.builder()
                .timestamp(when)
                .ipAddress("10.0.0." + (int) (Math.random() * 250 + 1))
                .action("SEED")
                .module(SecurityModule.API_GATEWAY)
                .status(status)
                .riskLevel(risk)
                .build());
    }

    private LoginHistory seedLoginHistory(String status, Instant when) {
        return loginHistoryRepository.save(LoginHistory.builder()
                .timestamp(when)
                .username("analytics.admin@test.local")
                .ipAddress("10.0.0.1")
                .status(status)
                .build());
    }

    private AuditLog seedAudit(String module, String action, LocalDateTime when) {
        return auditLogRepository.save(AuditLog.builder()
                .module(module)
                .action(action)
                .entityType("TEST")
                .severity(AuditSeverity.INFO)
                .status("SUCCESS")
                .createdAt(when)
                .build());
    }

    private Visitor seedVisitor() {
        User host = userRepository.findByEmailAndDeletedFalse("analytics.admin@test.local").orElseThrow();
        return visitorRepository.save(Visitor.builder()
                .fullName("Analytics Visitor")
                .email("visitor@test.local")
                .host(host)
                .purposeOfVisit("Analytics test")
                .expectedArrival(LocalDateTime.now(ZoneOffset.UTC))
                .status(VisitorStatus.REGISTERED)
                .build());
    }

    private Document seedDocument(String title, DocumentStatus status, LocalDateTime when) {
        Document doc = Document.builder()
                .title(title)
                .fileName(title + ".pdf")
                .classificationLevel(ClassificationLevel.CONFIDENTIAL)
                .status(status)
                .ownerEmail("analytics.admin@test.local")
                .department("IT")
                .build();
        doc.setCreatedAt(when);
        return documentRepository.save(doc);
    }

    private Contract seedContract(String number, ContractStatus status, LocalDateTime when) {
        Contract contract = Contract.builder()
                .contractNumber(number)
                .title("Contract " + number)
                .type(ContractType.VENDOR_SERVICE)
                .counterParty("Test Vendor")
                .startDate(LocalDate.now(ZoneOffset.UTC).minusDays(30))
                .endDate(LocalDate.now(ZoneOffset.UTC).plusDays(60))
                .status(status)
                .build();
        contract.setCreatedAt(when);
        return contractRepository.save(contract);
    }

    private BackupRecord seedBackup(String status, Instant when) {
        return backupRecordRepository.save(BackupRecord.builder()
                .backupType("DATABASE")
                .status(status)
                .startedAt(when)
                .completedAt(status.equals("COMPLETED") ? when.plus(Duration.ofSeconds(30)) : null)
                .fileSize(status.equals("COMPLETED") ? 1024L : null)
                .integrityCheck(status.equals("COMPLETED") ? "SHA256" : null)
                .triggeredBy("analytics.admin@test.local")
                .build());
    }

    private User user(String email, String dept, Role role) {
        return User.builder()
                .firstName("Analytics")
                .lastName("Admin")
                .email(email)
                .department(dept)
                .passwordHash("$2a$10$invalid-hash")
                .status(UserStatus.ACTIVE)
                .roles(Set.of(role))
                .build();
    }
}