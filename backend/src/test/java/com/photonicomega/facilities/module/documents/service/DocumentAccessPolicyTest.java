package com.photonicomega.facilities.module.documents.service;

import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.documents.domain.Category;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentGrant;
import com.photonicomega.facilities.module.documents.domain.DocumentGrantAccessLevel;
import com.photonicomega.facilities.module.documents.domain.DocumentGranteeType;
import com.photonicomega.facilities.module.documents.repository.DocumentGrantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DocumentAccessPolicyTest {

    @Mock
    private DocumentGrantRepository grantRepository;

    private DocumentAccessPolicy policy;

    @BeforeEach
    void setUp() {
        policy = new DocumentAccessPolicy(grantRepository);
        when(grantRepository.findByDocumentId(any())).thenReturn(List.of());
    }

    // --- helpers ----------------------------------------------------------

    private User user(String email, String department, String... roleNames) {
        Set<Role> roles = Set.of();
        if (roleNames.length > 0) {
            roles = java.util.stream.Stream.of(roleNames)
                    .map(name -> Role.builder().name(name).build())
                    .collect(java.util.stream.Collectors.toSet());
        }
        return User.builder().email(email).department(department).roles(roles).build();
    }

    private Document doc(String ownerEmail, String department, String title) {
        Document document = Document.builder()
                .title(title)
                .ownerEmail(ownerEmail)
                .department(department)
                .build();
        document.setId(UUID.randomUUID());
        return document;
    }

    private DocumentGrant grant(UUID documentId, DocumentGranteeType type, String key,
                                DocumentGrantAccessLevel level) {
        return DocumentGrant.builder()
                .documentId(documentId)
                .granteeType(type)
                .granteeKey(key)
                .accessLevel(level)
                .build();
    }

    // --- SUPER_ADMIN -------------------------------------------------------

    @Test
    void superAdminSeesAndDownloadsEverything() {
        User admin = user("admin@photonicomega.com", "IT", "SUPER_ADMIN");
        Document foreign = doc("someone@else.com", "Legal", "Private contract");
        assertTrue(policy.canView(admin, foreign));
        assertTrue(policy.canDownload(admin, foreign));
    }

    // --- governance roles --------------------------------------------------

    @Test
    void complianceAndLegalOfficersSeeCrossDepartmentDocuments() {
        User compliance = user("co@photonicomega.com", "Compliance", "COMPLIANCE_OFFICER");
        User legal = user("legal@photonicomega.com", "Legal", "LEGAL_OFFICER");
        Document foreign = doc("fm@photonicomega.com", "Facilities", "Facilities asset list");
        assertTrue(policy.canView(compliance, foreign));
        assertTrue(policy.canDownload(compliance, foreign));
        assertTrue(policy.canView(legal, foreign));
        assertTrue(policy.canDownload(legal, foreign));
    }

    // --- CONTRACT_OFFICER --------------------------------------------------

    @Test
    void contractOfficerCannotReadArbitraryCrossDepartmentDocuments() {
        User contract = user("contract@photonicomega.com", "Procurement", "CONTRACT_OFFICER");
        Document unrelated = doc("co@photonicomega.com", "Compliance", "ISO 9001 Quality Manual");
        assertFalse(policy.canView(contract, unrelated));
        assertFalse(policy.canDownload(contract, unrelated));
    }

    @Test
    void contractOfficerSeesOwnDepartmentDocuments() {
        User contract = user("contract@photonicomega.com", "Procurement", "CONTRACT_OFFICER");
        Document procurementDept = doc("co@photonicomega.com", "Procurement", "Legacy Vendor Records");
        assertTrue(policy.canView(contract, procurementDept));
        assertTrue(policy.canDownload(contract, procurementDept));
    }

    @Test
    void contractOfficerSeesContractRelatedDocuments() {
        User contract = user("contract@photonicomega.com", "Procurement", "CONTRACT_OFFICER");
        Document agreement = doc("co@photonicomega.com", "Compliance", "Data Processing Agreement - Acme Cloud");
        assertTrue(policy.canView(contract, agreement));
        assertTrue(policy.canDownload(contract, agreement));
    }

    @Test
    void contractOfficerSeesOwnDocuments() {
        User contract = user("contract@photonicomega.com", "Procurement", "CONTRACT_OFFICER");
        Document own = doc("contract@photonicomega.com", "Procurement", "My draft notes");
        assertTrue(policy.canView(contract, own));
    }

    // --- department-scoped users --------------------------------------------

    @Test
    void facilitiesRolesSeeOwnDepartmentButNotOthers() {
        User fm = user("fm@photonicomega.com", "Facilities", "FACILITIES_MANAGER");
        User fo = user("fo@photonicomega.com", "Facilities", "FACILITIES_OFFICER");
        Document local = doc("co@photonicomega.com", "Facilities", "Fire Safety Inspection Report");
        Document foreign = doc("co@photonicomega.com", "Compliance", "Employee Handbook");
        assertTrue(policy.canView(fm, local));
        assertTrue(policy.canView(fo, local));
        assertFalse(policy.canView(fm, foreign));
        assertFalse(policy.canView(fo, foreign));
        assertTrue(policy.canDownload(fm, local));
    }

    @Test
    void departmentComparisonIsCaseInsensitive() {
        User fo = user("fo@photonicomega.com", "facilities", "FACILITIES_OFFICER");
        Document local = doc("co@photonicomega.com", "Facilities", "Fire Safety Inspection Report");
        assertTrue(policy.canView(fo, local));
    }

    // --- EMPLOYEE ------------------------------------------------------------

    @Test
    void employeeIsOwnerScopedOnlyAndNotDepartmentWide() {
        User employee = user("employee@photonicomega.com", "General", "EMPLOYEE");
        Document own = doc("employee@photonicomega.com", "General", "Expense Reimbursement");
        Document sameDept = doc("colleague@photonicomega.com", "General", "Colleague expense");
        assertTrue(policy.canView(employee, own));
        assertFalse(policy.canView(employee, sameDept));
        assertFalse(policy.canDownload(employee, sameDept));
    }

    @Test
    void employeeSeesExplicitlySharedDocuments() {
        User employee = user("employee@photonicomega.com", "General", "EMPLOYEE");
        Document shared = doc("co@photonicomega.com", "Compliance", "Employee Handbook");
        when(grantRepository.findByDocumentId(any())).thenReturn(List.of(
                grant(shared.getId(), DocumentGranteeType.USER, "employee@photonicomega.com",
                        DocumentGrantAccessLevel.DOWNLOAD)));
        assertTrue(policy.canView(employee, shared));
        assertTrue(policy.canDownload(employee, shared));
    }

    @Test
    void viewGrantAllowsViewButNotDownload() {
        User employee = user("employee@photonicomega.com", "General", "EMPLOYEE");
        Document shared = doc("co@photonicomega.com", "Compliance", "Employee Handbook");
        when(grantRepository.findByDocumentId(any())).thenReturn(List.of(
                grant(shared.getId(), DocumentGranteeType.USER, "employee@photonicomega.com",
                        DocumentGrantAccessLevel.VIEW)));
        assertTrue(policy.canView(employee, shared));
        assertFalse(policy.canDownload(employee, shared));
    }

    @Test
    void roleGrantForContractOfficerOpensAnOtherwiseUnrelatedDocument() {
        User contract = user("contract@photonicomega.com", "Procurement", "CONTRACT_OFFICER");
        Document unrelated = doc("co@photonicomega.com", "Compliance", "ISO 9001 Quality Manual");
        when(grantRepository.findByDocumentId(any())).thenReturn(List.of(
                grant(unrelated.getId(), DocumentGranteeType.ROLE, "CONTRACT_OFFICER",
                        DocumentGrantAccessLevel.DOWNLOAD)));
        assertTrue(policy.canView(contract, unrelated));
        assertTrue(policy.canDownload(contract, unrelated));
    }

    @Test
    void grantForAnotherRoleDoesNotHelp() {
        User contract = user("contract@photonicomega.com", "Procurement", "CONTRACT_OFFICER");
        Document unrelated = doc("co@photonicomega.com", "Compliance", "ISO 9001 Quality Manual");
        when(grantRepository.findByDocumentId(any())).thenReturn(List.of(
                grant(unrelated.getId(), DocumentGranteeType.ROLE, "LEGAL_OFFICER",
                        DocumentGrantAccessLevel.DOWNLOAD)));
        assertFalse(policy.canView(contract, unrelated));
    }

    @Test
    void createdByFallsBackWhenOwnerEmailMissing() {
        User employee = user("employee@photonicomega.com", "General", "EMPLOYEE");
        Document legacy = Document.builder()
                .title("Legacy metadata row")
                .department("General")
                .build();
        legacy.setId(UUID.randomUUID());
        legacy.setCreatedBy("employee@photonicomega.com");
        assertTrue(policy.canView(employee, legacy));
    }

    @Test
    void anonymousAndNullCallsAreDenied() {
        Document doc = doc("co@photonicomega.com", "Compliance", "ISO 9001 Quality Manual");
        assertFalse(policy.canView(null, doc));
        assertFalse(policy.canDownload(null, doc));
        assertFalse(policy.canView(user("x@y.com", "General"), null));
    }

    @Test
    void contractRelatedKeywordAlsoMatchesCategory() {
        User contract = user("contract@photonicomega.com", "Procurement", "CONTRACT_OFFICER");
        Category category = Category.builder().name("CONTRACTS").build();
        category.setId(UUID.randomUUID());
        Document withCategory = Document.builder()
                .title("Something innocuous")
                .ownerEmail("co@photonicomega.com")
                .department("Compliance")
                .category(category)
                .build();
        withCategory.setId(UUID.randomUUID());
        assertTrue(policy.canView(contract, withCategory));
    }
}
