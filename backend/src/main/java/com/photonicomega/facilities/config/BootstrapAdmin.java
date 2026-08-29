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
import com.photonicomega.facilities.module.documents.domain.DocumentGrant;
import com.photonicomega.facilities.module.documents.domain.DocumentGrantAccessLevel;
import com.photonicomega.facilities.module.documents.domain.DocumentGranteeType;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentGrantRepository;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.employee.domain.NotificationType;
import com.photonicomega.facilities.module.employee.domain.RequestType;
import com.photonicomega.facilities.module.employee.repository.EmployeeNotificationRepository;
import com.photonicomega.facilities.module.employee.repository.EmployeeRequestRepository;
import com.photonicomega.facilities.module.legal.domain.CasePriority;
import com.photonicomega.facilities.module.legal.domain.CaseStatus;
import com.photonicomega.facilities.module.legal.domain.CaseType;
import com.photonicomega.facilities.module.legal.domain.LegalCase;
import com.photonicomega.facilities.module.legal.repository.LegalCaseRepository;
import com.photonicomega.facilities.module.legal.service.LegalService;
import com.photonicomega.facilities.module.procurement.domain.ObligationStatus;
import com.photonicomega.facilities.module.procurement.domain.Vendor;
import com.photonicomega.facilities.module.procurement.domain.VendorCategory;
import com.photonicomega.facilities.module.procurement.domain.VendorObligation;
import com.photonicomega.facilities.module.procurement.domain.VendorStatus;
import com.photonicomega.facilities.module.procurement.repository.VendorObligationRepository;
import com.photonicomega.facilities.module.procurement.repository.VendorRepository;
import com.photonicomega.facilities.module.procurement.service.ProcurementService;
import com.photonicomega.facilities.module.records.domain.PolicyAction;
import com.photonicomega.facilities.module.records.domain.RetentionPolicy;
import com.photonicomega.facilities.module.records.repository.RetentionPolicyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
@Order(10)
public class BootstrapAdmin implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final DocumentRepository documentRepository;
    private final DocumentGrantRepository documentGrantRepository;
    private final ContractRepository contractRepository;
    private final RetentionPolicyRepository retentionPolicyRepository;
    private final DisposalRequestRepository disposalRequestRepository;
    private final ComplianceService complianceService;
    private final LegalCaseRepository legalCaseRepository;
    private final LegalService legalService;
    private final VendorRepository vendorRepository;
    private final VendorObligationRepository vendorObligationRepository;
    private final ProcurementService procurementService;
    private final com.photonicomega.facilities.module.facilities.repository.FacilityRepository facilityRepository;
    private final com.photonicomega.facilities.module.facilities.repository.RoomRepository roomRepository;
    private final com.photonicomega.facilities.module.facilities.repository.ReservationRepository reservationRepository;
    private final com.photonicomega.facilities.module.visitor.repository.VisitorRepository visitorRepository;
    private final EmployeeRequestRepository employeeRequestRepository;
    private final EmployeeNotificationRepository employeeNotificationRepository;

    @Override
    public void run(String... args) {
        seedAdmin();
        seedFacilitiesManager();
        seedFacilitiesOfficer();
        seedComplianceOfficer();
        seedComplianceSampleData();
        seedLegalOfficer();
        seedLegalSampleData();
        seedContractOfficer();
        seedProcurementSampleData();
        seedEmployee();
        seedEmployeeSampleData();
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

        log.warn("Bootstrap admin user created with DEFAULT credentials (admin@photonicomega.com / Admin2026!). "
                + "Change the password before deploying outside a dev/test environment.");

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
                        .ownerEmail("co@photonicomega.com").department("Facilities")
                        .aiSummary("Annual fire safety inspection; two minor findings pending remediation.")
                        .versionNumber(1).build(),
                Document.builder()
                        .title("Data Processing Agreement - Acme Cloud")
                        .fileName("dpa-acme-cloud.pdf").fileType("application/pdf").fileSize(215_744L)
                        .classificationLevel(ClassificationLevel.CONFIDENTIAL).status(DocumentStatus.PENDING_REVIEW)
                        .ownerEmail("co@photonicomega.com").department("Compliance")
                        .aiSummary("GDPR data processing agreement; sub-processor list requires review.")
                        .versionNumber(2).build(),
                Document.builder()
                        .title("ISO 9001 Quality Manual")
                        .fileName("iso-9001-manual.pdf").fileType("application/pdf").fileSize(1_048_576L)
                        .classificationLevel(ClassificationLevel.INTERNAL).status(DocumentStatus.APPROVED)
                        .ownerEmail("co@photonicomega.com").department("Compliance")
                        .aiSummary("Quality management system manual, current revision approved.")
                        .versionNumber(5).build(),
                Document.builder()
                        .title("Employee Handbook")
                        .fileName("employee-handbook.pdf").fileType("application/pdf").fileSize(724_992L)
                        .classificationLevel(ClassificationLevel.PUBLIC).status(DocumentStatus.APPROVED)
                        .ownerEmail("co@photonicomega.com").department("Compliance")
                        .aiSummary("Company-wide HR policies and code of conduct.")
                        .versionNumber(3).build(),
                Document.builder()
                        .title("Legacy Vendor Records 2019")
                        .fileName("legacy-vendor-2019.zip").fileType("application/zip").fileSize(3_145_728L)
                        .classificationLevel(ClassificationLevel.RESTRICTED).status(DocumentStatus.ARCHIVED)
                        .ownerEmail("co@photonicomega.com").department("Procurement")
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

        // Explicit-exception grant for a role with NO default cross-department
        // window: CONTRACT_OFFICER gains DOWNLOAD on the procurement-facing
        // agreement. No grants are seeded for SUPER_ADMIN / COMPLIANCE_OFFICER /
        // LEGAL_OFFICER - their cross-department access comes from policy.
        savedDocs.stream()
                .filter(d -> "Data Processing Agreement - Acme Cloud".equals(d.getTitle()))
                .findFirst()
                .ifPresent(doc -> documentGrantRepository.save(DocumentGrant.builder()
                        .documentId(doc.getId())
                        .granteeType(DocumentGranteeType.ROLE)
                        .granteeKey("CONTRACT_OFFICER")
                        .accessLevel(DocumentGrantAccessLevel.DOWNLOAD)
                        .reason("Explicit contract-officer access to the procurement-facing agreement")
                        .build()));

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

    private void seedContractOfficer() {
        if (userRepository.findByEmailAndDeletedFalse("contract@photonicomega.com").isPresent()) {
            return;
        }
        log.info("Creating bootstrap contract officer user...");

        Permission contractPermission = Permission.builder()
                .name("CONTRACT_OPERATIONS")
                .displayName("Contract Operations")
                .description("Grants access to contract, vendor, and procurement modules")
                .module("PROCUREMENT")
                .resource("*")
                .action(PermissionAction.MANAGE)
                .build();

        Role contractRole = Role.builder()
                .name("CONTRACT_OFFICER")
                .displayName("Contract Officer")
                .description("Contract/procurement officer with contract lifecycle and vendor management access")
                .systemRole(true)
                .permissions(Set.of(contractPermission))
                .build();

        userRepository.save(User.builder()
                .email("contract@photonicomega.com")
                .passwordHash(passwordEncoder.encode("Contract2026!"))
                .firstName("Contract")
                .lastName("Officer")
                .employeeId("CTO-001")
                .department("Procurement")
                .position("Contract Officer")
                .status(UserStatus.ACTIVE)
                .emailVerified(true)
                .roles(Set.of(contractRole))
                .build());

        log.info("Bootstrap contract officer user created.");
    }

    /**
     * Seeds sample vendors + obligations, back-fills {@code Contract.vendorId}
     * by matching the compliance-seeded contract counterParties to vendor names,
     * then generates the initial procurement notices so the Contract Officer
     * dashboard shows live data on a fresh (H2 test-profile) database.
     * Idempotent: skips if any vendors already exist.
     */
    private void seedProcurementSampleData() {
        if (vendorRepository.count() > 0) {
            return;
        }
        log.info("Seeding procurement sample data (vendors, obligations)...");
        LocalDate today = LocalDate.now();

        Vendor skyline = vendorRepository.save(Vendor.builder()
                .vendorCode("VND-0001").name("Skyline Properties Ltd")
                .category(VendorCategory.FACILITIES).status(VendorStatus.ACTIVE)
                .contactName("Adwoa Boateng").contactEmail("leasing@skylineproperties.com")
                .contactPhone("+233 30 111 2233").address("12 Tower Road, Accra")
                .performanceScore(88).slaComplianceRate(new BigDecimal("96.5"))
                .notes("Landlord for Tower A; reliable, timely maintenance response.")
                .build());

        Vendor brightClean = vendorRepository.save(Vendor.builder()
                .vendorCode("VND-0002").name("BrightClean Co")
                .category(VendorCategory.MAINTENANCE).status(VendorStatus.ACTIVE)
                .contactName("Kofi Asare").contactEmail("ops@brightclean.com")
                .contactPhone("+233 30 222 3344").address("5 Industrial Ave, Tema")
                .performanceScore(74).slaComplianceRate(new BigDecimal("91.0"))
                .notes("Daily cleaning services; occasional missed weekend shifts.")
                .build());

        Vendor dataViz = vendorRepository.save(Vendor.builder()
                .vendorCode("VND-0003").name("DataViz Inc")
                .category(VendorCategory.IT_SERVICES).status(VendorStatus.PENDING_APPROVAL)
                .contactName("Sarah Lin").contactEmail("contracts@dataviz.io")
                .contactPhone("+1 415 555 0100").address("880 Market St, San Francisco")
                .performanceScore(58).slaComplianceRate(new BigDecimal("82.0"))
                .notes("Analytics suite vendor; SLA compliance below threshold, under review.")
                .build());

        Vendor secureForce = vendorRepository.save(Vendor.builder()
                .vendorCode("VND-0004").name("SecureForce Ltd")
                .category(VendorCategory.PROFESSIONAL_SERVICES).status(VendorStatus.SUSPENDED)
                .contactName("Daniel Owusu").contactEmail("accounts@secureforce.com")
                .contactPhone("+233 30 333 4455").address("40 Ring Road, Accra")
                .performanceScore(45).slaComplianceRate(new BigDecimal("70.0"))
                .notes("Security guard services; contract expired with coverage gap, performance poor.")
                .build());

        // Back-fill vendorId on the compliance-seeded contracts by matching
        // counterParty to the vendor name.
        List<Vendor> vendors = List.of(skyline, brightClean, dataViz, secureForce);
        contractRepository.findAll().forEach(contract -> vendors.stream()
                .filter(v -> v.getName().equalsIgnoreCase(contract.getCounterParty()))
                .findFirst()
                .ifPresent(v -> {
                    contract.setVendorId(v.getId());
                    contractRepository.save(contract);
                }));

        vendorObligationRepository.saveAll(List.of(
                VendorObligation.builder()
                        .vendor(skyline).title("Quarterly HVAC servicing report")
                        .description("Submit HVAC maintenance report for Tower A.")
                        .dueDate(today.plusDays(9)).status(ObligationStatus.PENDING)
                        .build(),
                VendorObligation.builder()
                        .vendor(brightClean).title("Monthly cleaning quality audit")
                        .description("Provide signed cleaning quality audit for the prior month.")
                        .dueDate(today.minusDays(5)).status(ObligationStatus.IN_PROGRESS)
                        .notes("Overdue; awaiting audit sign-off.")
                        .build(),
                VendorObligation.builder()
                        .vendor(dataViz).title("SLA remediation plan")
                        .description("Deliver a remediation plan to restore SLA compliance above 90%.")
                        .dueDate(today.plusDays(3)).status(ObligationStatus.PENDING)
                        .build(),
                VendorObligation.builder()
                        .vendor(secureForce).title("Handover of access credentials")
                        .description("Return all site access credentials following suspension.")
                        .dueDate(today.minusDays(20)).status(ObligationStatus.OVERDUE)
                        .notes("Well past due; escalate.")
                        .build()
        ));

        log.info("Procurement sample data seeded.");

        procurementService.generateNotices();
        log.info("Procurement notices seeded.");
    }

    private void seedEmployee() {
        if (userRepository.findByEmailAndDeletedFalse("employee@photonicomega.com").isPresent()) {
            return;
        }
        log.info("Creating bootstrap employee user...");

        Permission employeePermission = Permission.builder()
                .name("EMPLOYEE_OPERATIONS")
                .displayName("Employee Operations")
                .description("Grants self-service access to reservations, visitors, documents, and requests")
                .module("EMPLOYEE")
                .resource("*")
                .action(PermissionAction.MANAGE)
                .build();

        Role employeeRole = Role.builder()
                .name("EMPLOYEE")
                .displayName("Employee")
                .description("Self-service employee/requester with owner-scoped access to their own records")
                .systemRole(true)
                .permissions(Set.of(employeePermission))
                .build();

        userRepository.save(User.builder()
                .email("employee@photonicomega.com")
                .passwordHash(passwordEncoder.encode("Employee2026!"))
                .firstName("General")
                .lastName("Employee")
                .employeeId("EMP-001")
                .department("General")
                .position("Employee")
                .status(UserStatus.ACTIVE)
                .emailVerified(true)
                .roles(Set.of(employeeRole))
                .build());

        log.info("Bootstrap employee user created.");
    }

    /**
     * Seeds owner-scoped sample data for {@code employee@photonicomega.com} so the
     * Employee dashboard shows live data on a fresh (H2 test-profile) database:
     * a dedicated facility + room, a few reservations (mixed statuses), visitors,
     * a document, contract/legal requests, and notifications. Idempotent: skips
     * if any employee requests already exist.
     */
    private void seedEmployeeSampleData() {
        if (employeeRequestRepository.count() > 0) {
            return;
        }
        User employee = userRepository.findByEmailAndDeletedFalse("employee@photonicomega.com").orElse(null);
        if (employee == null) {
            return;
        }
        log.info("Seeding employee sample data (reservations, visitors, documents, requests, notifications)...");

        LocalDate today = LocalDate.now();

        // A dedicated facility + bookable room so reservations resolve a real room.
        com.photonicomega.facilities.module.facilities.domain.Facility facility =
                facilityRepository.save(com.photonicomega.facilities.module.facilities.domain.Facility.builder()
                        .name("Green GSM Head Office")
                        .code("HQ-EMP")
                        .type(com.photonicomega.facilities.module.facilities.domain.FacilityType.HEADQUARTERS)
                        .address("1 Innovation Way, Accra").city("Accra").country("Ghana")
                        .timezone("Africa/Accra").totalCapacity(120).active(true)
                        .build());

        com.photonicomega.facilities.module.facilities.domain.Room room =
                roomRepository.save(com.photonicomega.facilities.module.facilities.domain.Room.builder()
                        .facility(facility).roomNumber("R-201").name("Collaboration Room 201")
                        .type(com.photonicomega.facilities.module.facilities.domain.RoomType.MEETING_ROOM)
                        .floorNumber(2).building("Main").capacity(12)
                        .openTime(java.time.LocalTime.of(7, 0)).closeTime(java.time.LocalTime.of(20, 0))
                        .status(com.photonicomega.facilities.module.facilities.domain.RoomStatus.VACANT)
                        .hasProjector(true).hasVideoConference(true).hasWhiteboard(true)
                        .active(true)
                        .build());

        reservationRepository.saveAll(List.of(
                com.photonicomega.facilities.module.facilities.domain.Reservation.builder()
                        .room(room).reservedBy(employee).title("Team Sync")
                        .description("Weekly team sync-up.")
                        .startTime(today.plusDays(2).atTime(10, 0)).endTime(today.plusDays(2).atTime(11, 0))
                        .status(com.photonicomega.facilities.module.facilities.domain.ReservationStatus.APPROVED)
                        .expectedAttendees(8).build(),
                com.photonicomega.facilities.module.facilities.domain.Reservation.builder()
                        .room(room).reservedBy(employee).title("Project Kickoff")
                        .description("Kickoff meeting for the Q3 initiative.")
                        .startTime(today.plusDays(5).atTime(14, 0)).endTime(today.plusDays(5).atTime(15, 30))
                        .status(com.photonicomega.facilities.module.facilities.domain.ReservationStatus.PENDING)
                        .expectedAttendees(10).build(),
                com.photonicomega.facilities.module.facilities.domain.Reservation.builder()
                        .room(room).reservedBy(employee).title("1:1 Review")
                        .description("Requested outside operating hours.")
                        .startTime(today.plusDays(1).atTime(9, 0)).endTime(today.plusDays(1).atTime(9, 30))
                        .status(com.photonicomega.facilities.module.facilities.domain.ReservationStatus.REJECTED)
                        .rejectionReason("Room unavailable at requested time.")
                        .expectedAttendees(2).build()
        ));

        visitorRepository.saveAll(List.of(
                com.photonicomega.facilities.module.visitor.domain.Visitor.builder()
                        .fullName("Ama Serwaa").email("ama.serwaa@partner.com")
                        .phoneNumber("+233 24 555 0111").company("Partner Logistics")
                        .host(employee).purposeOfVisit("Contract handover meeting")
                        .expectedArrival(today.plusDays(1).atTime(11, 0))
                        .status(com.photonicomega.facilities.module.visitor.domain.VisitorStatus.REGISTERED)
                        .qrCodeToken("VIS-EMP0001").build(),
                com.photonicomega.facilities.module.visitor.domain.Visitor.builder()
                        .fullName("Yaw Mensah").email("yaw.mensah@supplier.io")
                        .phoneNumber("+233 20 555 0222").company("Supplier Co")
                        .host(employee).purposeOfVisit("Equipment delivery")
                        .expectedArrival(today.plusDays(3).atTime(9, 30))
                        .status(com.photonicomega.facilities.module.visitor.domain.VisitorStatus.REGISTERED)
                        .qrCodeToken("VIS-EMP0002").build()
        ));

        // Stamp createdBy to the employee's email (via the auditing SecurityContext)
        // so the document appears in their owner-scoped document list.
        org.springframework.security.core.context.SecurityContext previous =
                org.springframework.security.core.context.SecurityContextHolder.getContext();
        try {
            org.springframework.security.core.context.SecurityContext ctx =
                    org.springframework.security.core.context.SecurityContextHolder.createEmptyContext();
            ctx.setAuthentication(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                    employee.getEmail(), null, java.util.Collections.emptyList()));
            org.springframework.security.core.context.SecurityContextHolder.setContext(ctx);
            documentRepository.save(Document.builder()
                    .title("Expense Reimbursement - June")
                    .fileName("expense-june.pdf").fileType("application/pdf").fileSize(128_512L)
                    .classificationLevel(ClassificationLevel.INTERNAL)
                    .status(DocumentStatus.PENDING_REVIEW)
                    .ownerEmail(employee.getEmail())
                    .department(employee.getDepartment())
                    .versionNumber(1).build());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.setContext(previous);
        }

        employeeRequestRepository.saveAll(List.of(
                com.photonicomega.facilities.module.employee.domain.EmployeeRequest.builder()
                        .requester(employee)
                        .type(RequestType.CONTRACT)
                        .title("New laptop procurement")
                        .description("Request procurement of a replacement laptop for field work.")
                        .status(com.photonicomega.facilities.module.employee.domain.RequestStatus.PENDING)
                        .build(),
                com.photonicomega.facilities.module.employee.domain.EmployeeRequest.builder()
                        .requester(employee)
                        .type(RequestType.LEGAL)
                        .title("NDA review for external consultant")
                        .description("Please review the attached NDA before signing with the consultant.")
                        .status(com.photonicomega.facilities.module.employee.domain.RequestStatus.IN_REVIEW)
                        .build()
        ));

        log.info("Employee sample data seeded.");
        // NOTE: No notifications are seeded here. Notifications are created only
        // by real business events (request submission/review, visitor check-in, etc.).
    }
}
