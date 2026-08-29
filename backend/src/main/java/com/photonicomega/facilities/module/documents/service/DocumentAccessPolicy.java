package com.photonicomega.facilities.module.documents.service;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentGrant;
import com.photonicomega.facilities.module.documents.domain.DocumentGrantAccessLevel;
import com.photonicomega.facilities.module.documents.domain.DocumentGranteeType;
import com.photonicomega.facilities.module.documents.repository.DocumentGrantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Central authorization policy for the document module.
 *
 * <p>Default visibility matrix (all department comparisons are
 * case-insensitive, exact roles only - the backend defines {@code SUPER_ADMIN}
 * as the single system-administrator role):
 *
 * <ul>
 *   <li>SUPER_ADMIN - all documents.</li>
 *   <li>COMPLIANCE_OFFICER / LEGAL_OFFICER - cross-department governance
 *       VIEW + DOWNLOAD, with no generic UPDATE/DELETE/SHARE.</li>
 *   <li>CONTRACT_OFFICER - own documents, own-department (Procurement)
 *       documents, contract-related documents, and explicit grants. No
 *       unrestricted access to the whole catalogue.</li>
 *   <li>FACILITIES_MANAGER / FACILITIES_OFFICER - own documents,
 *       documents in their own department, and explicit grants.</li>
 *   <li>EMPLOYEE - own documents and explicit grants only; never an
 *       automatic department-wide window.</li>
 * </ul>
 *
 * <p>Grant rows ({@code document_grants}) are the explicit-exception /
 * sharing mechanism. Roles already covered by the default policy
 * (SUPER_ADMIN, COMPLIANCE_OFFICER, LEGAL_OFFICER) do not need grant rows.
 */
@Service
@RequiredArgsConstructor
public class DocumentAccessPolicy {

    private static final String SUPER_ADMIN = "SUPER_ADMIN";
    private static final String COMPLIANCE_OFFICER = "COMPLIANCE_OFFICER";
    private static final String LEGAL_OFFICER = "LEGAL_OFFICER";
    private static final String CONTRACT_OFFICER = "CONTRACT_OFFICER";
    private static final String EMPLOYEE = "EMPLOYEE";

    /** Keywords used to recognise contract-related documents for CONTRACT_OFFICER. */
    private static final Set<String> CONTRACT_KEYWORDS = Set.of(
            "contract", "procurement", "vendor", "supplier", "sla",
            "lease", "purchase", "agreement", "obligation", "dpa");

    private final DocumentGrantRepository grantRepository;

    /** Whether the caller may see the document metadata. */
    public boolean canView(User user, Document document) {
        if (user == null || document == null) {
            return false;
        }
        if (hasRole(user, SUPER_ADMIN)) {
            return true;
        }
        if (isOwner(user, document)) {
            return true;
        }
        if (hasGrant(user, document, null)) {
            return true;
        }
        if (hasRole(user, COMPLIANCE_OFFICER) || hasRole(user, LEGAL_OFFICER)) {
            return true;
        }
        if (hasRole(user, CONTRACT_OFFICER)) {
            return isContractRelated(document) || sameDepartment(user, document);
        }
        if (hasRole(user, EMPLOYEE)) {
            return false;
        }
        return sameDepartment(user, document);
    }

    /** Whether the caller may download the stored file for a document. */
    public boolean canDownload(User user, Document document) {
        if (user == null || document == null) {
            return false;
        }
        if (hasRole(user, SUPER_ADMIN)) {
            return true;
        }
        if (isOwner(user, document)) {
            return true;
        }
        if (hasGrant(user, document, DocumentGrantAccessLevel.DOWNLOAD)) {
            return true;
        }
        if (hasRole(user, COMPLIANCE_OFFICER) || hasRole(user, LEGAL_OFFICER)) {
            return true;
        }
        if (hasRole(user, CONTRACT_OFFICER)) {
            return isContractRelated(document) || sameDepartment(user, document);
        }
        if (hasRole(user, EMPLOYEE)) {
            return false;
        }
        return sameDepartment(user, document);
    }

    /** Filters a fetched document list down to what the caller may view. */
    public List<Document> filterViewable(User user, List<Document> documents) {
        if (documents == null) {
            return List.of();
        }
        return documents.stream()
                .filter(document -> canView(user, document))
                .collect(Collectors.toList());
    }

    private boolean isOwner(User user, Document document) {
        if (document.getOwnerEmail() != null && !document.getOwnerEmail().isBlank()) {
            return document.getOwnerEmail().equalsIgnoreCase(user.getEmail());
        }
        return document.getCreatedBy() != null && document.getCreatedBy().equalsIgnoreCase(user.getEmail());
    }

    private boolean hasRole(User user, String roleName) {
        return user.getRoles().stream()
                .anyMatch(role -> hasRole(role, roleName, new HashSet<>()));
    }

    private boolean hasRole(Role role, String roleName, Set<String> visited) {
        if (role.getName() == null || !visited.add(role.getName())) return false;
        if (role.getName().equalsIgnoreCase(roleName)) return true;
        return role.getInheritedRoles().stream()
                .anyMatch(inherited -> hasRole(inherited, roleName, visited));
    }

    /**
     * A grant matches when it targets this user's email (USER) or any of the
     * user's roles (ROLE). {@code requiredLevel} narrows to grants at least
     * as permissive as the requested level; {@code null} accepts any grant.
     */
    private boolean hasGrant(User user, Document document, DocumentGrantAccessLevel requiredLevel) {
        List<DocumentGrant> grants = grantRepository.findByDocumentId(document.getId());
        if (grants.isEmpty()) {
            return false;
        }
        Set<String> roleNames = user.getRoles().stream()
                .flatMap(role -> effectiveRoleNames(role, new HashSet<>()).stream())
                .collect(Collectors.toSet());

        return grants.stream().anyMatch(grant ->
                !grant.isDeleted()
                        && matchesGrantee(grant, user.getEmail(), roleNames)
                        && grantsRequiredLevel(grant.getAccessLevel(), requiredLevel));
    }

    private Set<String> effectiveRoleNames(Role role, Set<String> visited) {
        if (role.getName() == null || !visited.add(role.getName())) return Set.of();
        Set<String> names = new HashSet<>();
        names.add(role.getName().toUpperCase(Locale.ROOT));
        role.getInheritedRoles().forEach(inherited -> names.addAll(effectiveRoleNames(inherited, visited)));
        return names;
    }

    private boolean matchesGrantee(DocumentGrant grant, String email, Set<String> roleNames) {
        String key = grant.getGranteeKey() == null ? "" : grant.getGranteeKey();
        if (grant.getGranteeType() == DocumentGranteeType.USER) {
            return key.equalsIgnoreCase(email);
        }
        if (grant.getGranteeType() == DocumentGranteeType.ROLE) {
            return roleNames.contains(key.toUpperCase(Locale.ROOT));
        }
        return false;
    }

    private boolean grantsRequiredLevel(DocumentGrantAccessLevel granted,
                                        DocumentGrantAccessLevel requiredLevel) {
        if (requiredLevel == null) {
            return true;
        }
        if (granted == DocumentGrantAccessLevel.DOWNLOAD) {
            return true;
        }
        return granted == requiredLevel;
    }

    private boolean sameDepartment(User user, Document document) {
        String userDept = normalize(user.getDepartment());
        String docDept = normalize(document.getDepartment());
        return !userDept.isEmpty() && userDept.equals(docDept);
    }

    private boolean isContractRelated(Document document) {
        if (document == null) {
            return false;
        }
        StringBuilder haystack = new StringBuilder();
        append(haystack, document.getTitle());
        append(haystack, document.getAiPredictedCategory());
        append(haystack, document.getDepartment());
        if (document.getCategory() != null) {
            append(haystack, document.getCategory().getName());
        }
        String text = haystack.toString().toLowerCase(Locale.ROOT);
        return CONTRACT_KEYWORDS.stream().anyMatch(text::contains);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private void append(StringBuilder sb, String value) {
        if (value != null && !value.isBlank()) {
            sb.append(' ').append(value);
        }
    }
}
