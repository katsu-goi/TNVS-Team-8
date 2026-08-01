package com.photonicomega.facilities.config;

import com.photonicomega.facilities.module.auth.domain.Permission;
import com.photonicomega.facilities.module.auth.domain.PermissionAction;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.contracts.domain.Contract;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.domain.ContractType;
import com.photonicomega.facilities.module.contracts.domain.RiskLevel;
import com.photonicomega.facilities.module.contracts.repository.ContractRepository;
import com.photonicomega.facilities.module.compliance.domain.DisposalRequest;
import com.photonicomega.facilities.module.compliance.domain.DisposalStatus;
import com.photonicomega.facilities.module.compliance.repository.DisposalRequestRepository;
import com.photonicomega.facilities.module.compliance.service.ComplianceService;
import com.photonicomega.facilities.module.documents.domain.ClassificationLevel;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.legal.domain.CasePriority;
import com.photonicomega.facilities.module.legal.domain.CaseStatus;
import com.photonicomega.facilities.module.legal.domain.CaseType;
import com.photonicomega.facilities.module.legal.domain.LegalCase;
import com.photonicomega.facilities.module.legal.repository.LegalCaseRepository;
import com.photonicomega.facilities.module.legal.service.LegalService;
import com.photonicomega.facilities.module.records.domain.PolicyAction;
import com.photonicomega.facilities.module.records.domain.RetentionPolicy;
import com.photonicomega.facilities.module.records.repository.RetentionPolicyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class BootstrapAdmin implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final DocumentRepository documentRepository;
    private final ContractRepository contractRepository;
    private final RetentionPolicyRepository retentionPolicyRepository;
    private final DisposalRequestRepository disposalRequestRepository;
    private final ComplianceService complianceService;
    private final LegalCaseRepository legalCaseRepository;
    private final LegalService legalService;

    @Override
    public void run(String... args) {
        seedAdmin();
        seedFacilitiesManager();
        seedFacilitiesOfficer();
        seedComplianceOfficer();
        seedComplianceSampleData();
        seedLegalOfficer();
        seedLegalSampleData();
    }

    private void seedAdmin() {
        if (userRepository.findByEmailAndDeletedFalse("admin@photonicomega.com").isPresent()) {
            return;
        }
        log.info("Creating bootstrap admin user...");

        Permission allPermission = Permission.builder()
                .name("ALL")
                .displayName("All Permissions")
                .description("Grants full system access")
                .module("SYSTEM")
                .resource("*")
                .action(PermissionAction.MANAGE)
                .build();

        Role superAdminRole = Role.builder()
                .name("SUPER_ADMIN")
                .displayName("Super Administrator")
                .description("System super administrator with unrestricted access")
                .systemRole(true)
                .permissions(Set.of(allPermission))
                .build();

        userRepository.save(User.builder()
                .email("admin@photonicomega.com")
                .passwordHash(passwordEncoder.encode("Admin2026!"))
                .firstName("System")
                .lastName("Administrator")
                .employeeId("ADMIN-001")
                .department("IT")
                .position("System Administrator")
                .status(UserStatus.ACTIVE)
                .emailVerified(true)
                .roles(Set.of(superAdminRole))
                .build());

        log.info("Bootstrap admin user created.");
    }

    private void seedFacilitiesManager() {
        if (userRepository.findByEmailAndDeletedFalse("fm@photonicomega.com").isPresent()) {
            return;
        }
        log.info("Creating bootstrap facilities manager user...");

        Permission fmPermission = Permission.builder()
                .name("FACILITIES_MANAGE")
                .displayName("Facilities Management")
                .description("Grants access to facilities management modules")
                .module("FACILITIES")
                .resource("*")
                .action(PermissionAction.MANAGE)
                .build();

        Role fmRole = Role.builder()
                .name("FACILITIES_MANAGER")
                .displayName("Facilities Manager")
                .description("Facilities manager with operational access")
                .systemRole(true)
                .permissions(Set.of(fmPermission))
                .build();

        userRepository.save(User.builder()
                .email("fm@photonicomega.com")
                .passwordHash(passwordEncoder.encode("Fm2026!"))
                .firstName("Facilities")
                .lastName("Manager")
                .employeeId("FM-001")
                .department("Facilities")
                .position("Facilities Manager")
                .status(UserStatus.ACTIVE)
                .emailVerified(true)
                .roles(Set.of(fmRole))
                .build());

        log.info("Bootstrap facilities manager user created.");
    }

    private void seedFacilitiesOfficer() {
        if (userRepository.findByEmailAndDeletedFalse("fo@photonicomega.com").isPresent()) {
            return;
        }
        log.info("Creating bootstrap facilities officer user...");

        Permission foPermission = Permission.builder()
                .name("FACILITIES_OPERATIONS")
                .displayName("Facilities Operations")
                .description("Grants access to facilities operations modules")
                .module("FACILITIES")
                .resource("*")
                .action(PermissionAction.MANAGE)
                .build();

        Role foRole = Role.builder()
                .name("FACILITIES_OFFICER")
                .displayName("Facilities Officer")
                .description("Facilities officer with operational access")
                .systemRole(true)
                .permissions(Set.of(foPermission))
                .build();

        userRepository.save(User.builder()
                .email("fo@photonicomega.com")
                .passwordHash(passwordEncoder.encode("Fo2026!"))
                .firstName("Facilities")
                .lastName("Officer")
                .employeeId("FO-001")
                .department("Facilities")
                .position("Facilities Officer")
                .status(UserStatus.ACTIVE)
                .emailVerified(true)
                .roles(Set.of(foRole))
                .build());

        log.info("Bootstrap facilities officer user created.");
    }

    private void seedComplianceOfficer() {
        if (userRepository.findByEmailAndDeletedFalse("co@photonicomega.com").isPresent()) {
            return;
        }
        log.info("Creating bootstrap compliance officer user...");

        Permission coPermission = Permission.builder()
                .name("COMPLIANCE_OPERATIONS")
                .displayName("Compliance Operations")
                .description("Grants access to records & compliance modules")
                .module("COMPLIANCE")
                .resource("*")
                .action(PermissionAction.MANAGE)
                .build();

        Role coRole = Role.builder()
                .name("COMPLIANCE_OFFICER")
                .displayName("Compliance Officer")
                .description("Records & compliance officer with oversight access")
                .systemRole(true)
                .permissions(Set.of(coPermission))
                .build();

        userRepository.save(User.builder()
                .email("co@photonicomega.com")
                .passwordHash(passwordEncoder.encode("Co2026!"))
                .firstName("Compliance")
                .lastName("Officer")
                .employeeId("CO-001")
                .department("Compliance")
                .position("Records/Compliance Officer")
                .status(UserStatus.ACTIVE)
                .emailVerified(true)
                .roles(Set.of(coRole))
                .build());

        log.info("Bootstrap compliance officer user created.");
    }

    /**
     * Seeds a small, clearly-labeled set of sample documents, contracts, and
     * retention policies so the Records/Compliance Officer dashboard shows live
     * data on a fresh (H2 test-profile) database. Idempotent: skips if any
     * documents already exist.
     */
    private void seedComplianceSampleData() {
        if (documentRepository.count() > 0) {
            return;
        }
        log.info("Seeding compliance sample data (documents, contracts, retention policies)...");

        List<Document> savedDocs = documentRepository.saveAll(List.of(
                Document.builder()
                        .title("Fire Safety Inspection Report 2026")
                        .fileName("fire-safety-2026.pdf").fileType("application/pdf").fileSize(482_112L)
                        .classificationLevel(ClassificationLevel.INTERNAL).status(DocumentStatus.PENDING_REVIEW)
                        .aiSummary("Annual fire safety inspection; two minor findings pending remediation.")
                        .versionNumber(1).build(),
                Document.builder()
                        .title("Data Processing Agreement - Acme Cloud")
                        .fileName("dpa-acme-cloud.pdf").fileType("application/pdf").fileSize(215_744L)
                        .classificationLevel(ClassificationLevel.CONFIDENTIAL).status(DocumentStatus.PENDING_REVIEW)
                        .aiSummary("GDPR data processing agreement; sub-processor list requires review.")
                        .versionNumber(2).build(),
                Document.builder()
                        .title("ISO 9001 Quality Manual")
                        .fileName("iso-9001-manual.pdf").fileType("application/pdf").fileSize(1_048_576L)
                        .classificationLevel(ClassificationLevel.INTERNAL).status(DocumentStatus.APPROVED)
                        .aiSummary("Quality management system manual, current revision approved.")
                        .versionNumber(5).build(),
                Document.builder()
                        .title("Employee Handbook")
                        .fileName("employee-handbook.pdf").fileType("application/pdf").fileSize(724_992L)
                        .classificationLevel(ClassificationLevel.PUBLIC).status(DocumentStatus.APPROVED)
                        .aiSummary("Company-wide HR policies and code of conduct.")
                        .versionNumber(3).build(),
                Document.builder()
                        .title("Legacy Vendor Records 2019")
                        .fileName("legacy-vendor-2019.zip").fileType("application/zip").fileSize(3_145_728L)
                        .classificationLevel(ClassificationLevel.RESTRICTED).status(DocumentStatus.ARCHIVED)
                        .aiSummary("Archived vendor records retained for audit trail.")
                        .versionNumber(1).build()
        ));

        LocalDate today = LocalDate.now();
        contractRepository.saveAll(List.of(
                Contract.builder()
                        .contractNumber("CT-2026-001").title("Office Lease - Tower A")
                        .type(ContractType.LEASE).counterParty("Skyline Properties Ltd")
                        .contractValue(new BigDecimal("240000.00"))
                        .startDate(today.minusMonths(11)).endDate(today.plusDays(18))
                        .renewalNoticeDate(today.plusDays(4)).status(ContractStatus.ACTIVE)
                        .aiAssessedRiskLevel(RiskLevel.MEDIUM)
                        .aiRiskSummary("Renewal notice window closing; auto-renew clause present.").build(),
                Contract.builder()
                        .contractNumber("CT-2026-002").title("Cleaning Services SLA")
                        .type(ContractType.MAINTENANCE_SLA).counterParty("BrightClean Co")
                        .contractValue(new BigDecimal("54000.00"))
                        .startDate(today.minusMonths(6)).endDate(today.plusDays(25))
                        .renewalNoticeDate(today.plusDays(10)).status(ContractStatus.ACTIVE)
                        .aiAssessedRiskLevel(RiskLevel.LOW)
                        .aiRiskSummary("Standard SLA terms, low risk.").build(),
                Contract.builder()
                        .contractNumber("CT-2026-003").title("Software Procurement - Analytics Suite")
                        .type(ContractType.PROCUREMENT).counterParty("DataViz Inc")
                        .contractValue(new BigDecimal("120000.00"))
                        .startDate(today.minusMonths(1)).endDate(today.plusMonths(11))
                        .status(ContractStatus.UNDER_REVIEW)
                        .aiAssessedRiskLevel(RiskLevel.HIGH)
                        .aiRiskSummary("Liability cap below policy threshold; legal review recommended.").build(),
                Contract.builder()
                        .contractNumber("CT-2025-047").title("Security Guard Services")
                        .type(ContractType.VENDOR_SERVICE).counterParty("SecureForce Ltd")
                        .contractValue(new BigDecimal("98000.00"))
                        .startDate(today.minusYears(1).minusMonths(2)).endDate(today.minusDays(12))
                        .status(ContractStatus.EXPIRED)
                        .aiAssessedRiskLevel(RiskLevel.CRITICAL)
                        .aiRiskSummary("Expired without renewal; coverage gap flagged.").build()
        ));

        retentionPolicyRepository.saveAll(List.of(
                RetentionPolicy.builder()
                        .name("Financial Records").description("Statutory retention for financial documents")
                        .retentionPeriodDays(2555).actionOnExpiry(PolicyAction.ARCHIVE).active(true).build(),
                RetentionPolicy.builder()
                        .name("HR Personnel Files").description("Employee records post-termination retention")
                        .retentionPeriodDays(1825).actionOnExpiry(PolicyAction.REVIEW).active(true).build(),
                RetentionPolicy.builder()
                        .name("Transient Working Drafts").description("Short-lived working documents")
                        .retentionPeriodDays(90).actionOnExpiry(PolicyAction.PERMANENT_DELETE).active(true).build()
        ));

        log.info("Compliance sample data seeded.");

        // Seed one pending disposal request for the archived legacy doc, then
        // generate the initial compliance alerts so the dashboard shows a live
        // actionable feed on a fresh database.
        savedDocs.stream()
                .filter(d -> "Legacy Vendor Records 2019".equals(d.getTitle()))
                .findFirst()
                .ifPresent(doc -> disposalRequestRepository.save(DisposalRequest.builder()
                        .documentId(doc.getId())
                        .documentTitle(doc.getTitle())
                        .reason("Retention period elapsed; audit trail no longer required.")
                        .status(DisposalStatus.PENDING)
                        .build()));

        complianceService.generateAlerts();
        log.info("Compliance disposal request and alerts seeded.");
    }

    private void seedLegalOfficer() {
        if (userRepository.findByEmailAndDeletedFalse("legal@photonicomega.com").isPresent()) {
            return;
        }
        log.info("Creating bootstrap legal officer user...");

        Permission legalPermission = Permission.builder()
                .name("LEGAL_OPERATIONS")
                .displayName("Legal Operations")
                .description("Grants access to legal, contract, and compliance modules")
                .module("LEGAL")
                .resource("*")
                .action(PermissionAction.MANAGE)
                .build();

        Role legalRole = Role.builder()
                .name("LEGAL_OFFICER")
                .displayName("Legal Officer")
                .description("Legal officer with contract, legal-case, and compliance oversight access")
                .systemRole(true)
                .permissions(Set.of(legalPermission))
                .build();

        userRepository.save(User.builder()
                .email("legal@photonicomega.com")
                .passwordHash(passwordEncoder.encode("Legal2026!"))
                .firstName("Legal")
                .lastName("Officer")
                .employeeId("LG-001")
                .department("Legal")
                .position("Legal Officer")
                .status(UserStatus.ACTIVE)
                .emailVerified(true)
                .roles(Set.of(legalRole))
                .build());

        log.info("Bootstrap legal officer user created.");
    }

    /**
     * Seeds sample legal cases so the Legal Officer dashboard shows live data on
     * a fresh (H2 test-profile) database, then generates the initial legal
     * notices (which also draw on contracts seeded by the compliance seeder).
     * Idempotent: skips the cases if any already exist.
     */
    private void seedLegalSampleData() {
        if (legalCaseRepository.count() == 0) {
            log.info("Seeding legal sample data (legal cases)...");
            LocalDate today = LocalDate.now();
            legalCaseRepository.saveAll(List.of(
                    LegalCase.builder()
                            .caseNumber("CASE-2026-001").title("Vendor Breach - DataViz Analytics")
                            .description("Alleged breach of SLA terms by analytics vendor; recovery of damages sought.")
                            .courtName("Commercial Court").judgeName("Hon. R. Mensah")
                            .opposingParty("DataViz Inc")
                            .caseType(CaseType.CONTRACT_DISPUTE).status(CaseStatus.PENDING_HEARING)
                            .priority(CasePriority.HIGH)
                            .filingDate(today.minusMonths(2)).expectedResolutionDate(today.plusMonths(3))
                            .build(),
                    LegalCase.builder()
                            .caseNumber("CASE-2026-002").title("Regulatory Inquiry - Data Protection")
                            .description("Data-protection authority inquiry into cross-border transfers.")
                            .caseType(CaseType.REGULATORY).status(CaseStatus.IN_PROGRESS)
                            .priority(CasePriority.CRITICAL)
                            .filingDate(today.minusMonths(1)).expectedResolutionDate(today.plusMonths(2))
                            .build(),
                    LegalCase.builder()
                            .caseNumber("CASE-2025-014").title("Lease Deposit Recovery")
                            .description("Recovery of retained deposit from prior premises lease.")
                            .courtName("Small Claims Tribunal")
                            .opposingParty("Skyline Properties Ltd")
                            .caseType(CaseType.CONTRACT_DISPUTE).status(CaseStatus.SETTLED)
                            .priority(CasePriority.LOW)
                            .filingDate(today.minusMonths(8)).closedDate(today.minusMonths(1))
                            .resolutionNotes("Settled out of court; 80% of deposit recovered.")
                            .build()
            ));
            log.info("Legal sample data seeded.");
        }

        legalService.generateNotices();
        log.info("Legal notices seeded.");
    }
}
