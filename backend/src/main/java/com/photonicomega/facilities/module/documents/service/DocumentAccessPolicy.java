package com.photonicomega.facilities.module.documents.service;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentGrant;
import com.photonicomega.facilities.module.documents.domain.DocumentGrantAccessLevel;
import com.photonicomega.facilities.module.documents.domain.DocumentGranteeType;
import com.photonicomega.facilities.module.documents.repository.DocumentGrantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
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
 *   <li>Records &amp; legal authorities - cross-department governance
 *       VIEW + DOWNLOAD, with no generic UPDATE/DELETE/SHARE. See
 *       {@link #RECORDS_AUTHORITIES}.</li>
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
 * sharing mechanism. Roles already covered by the default policy do not need
 * grant rows.
 */
@Service
@RequiredArgsConstructor
public class DocumentAccessPolicy {

    private static final String SUPER_ADMIN = "SUPER_ADMIN";
    private static final String CONTRACT_OFFICER = "CONTRACT_OFFICER";
    private static final String EMPLOYEE = "EMPLOYEE";

    /**
     * Roles whose duty <em>is</em> the company's records, and which therefore read
     * across departments.
     *
     * <p>The last four were added because the approval gate had made them approvers
     * of document disposal, deletion, declassification and retention override
     * without anything making them readers. Those actions carry no department scope -
     * a {@code COMPLIANCE_MANAGER} can be asked about any document in the company -
     * while this policy fell through to "same department only" for every role it did
     * not name. So a fresh install shipped a pending disposal for an archived
     * Procurement record whose only eligible approvers sat in Compliance and Legal,
     * and not one of them could open it. The signature would still have been
     * collected, and the audit trail would have recorded a second review that nobody
     * was able to perform - false assurance, which is worse than no second review at
     * all, because the record of it looks identical to the real thing.
     *
     * <p>Only <em>approvers</em> are listed. Requesters are deliberately not, even
     * though {@code FACILITIES_MANAGER} and {@code DEPARTMENT_HEAD} can raise a
     * document deletion: someone asking for an act only needs to see what they are
     * already entitled to see, and the person who authorises it is the one who has to
     * see the whole picture. Widening the requester side instead would hand a
     * department-wide window to two roles that are deliberately scoped, and gain
     * nothing - a request naming a document its requester cannot read is exactly the
     * request an approver who <em>can</em> read it should refuse.
     *
     * <p>{@code RECORDS_OFFICER} is a requester rather than an approver, and is
     * included anyway: {@code COMPLIANCE_OFFICER} already reads across departments
     * and the seeded account holding it is titled "Records/Compliance Officer", so
     * the dedicated records role would otherwise have had strictly less reach over
     * records than the compliance officer standing in for it.
     *
     * <p>Every role here is a records or legal authority. None is an administrator,
     * and none was added because an administrative account was inconvenienced -
     * administering the platform still confers no authority over what it stores.
     */
    private static final Set<String> RECORDS_AUTHORITIES = Set.of(
            "COMPLIANCE_OFFICER",
            "LEGAL_OFFICER",
            "RECORDS_OFFICER",
            "COMPLIANCE_MANAGER",
            "DATA_PROTECTION_OFFICER",
            "LEGAL_COUNSEL");

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
        if (isRecordsAuthority(user)) {
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
        if (isRecordsAuthority(user)) {
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
                .anyMatch(role -> role.getName() != null && role.getName().equalsIgnoreCase(roleName));
    }

    /**
     * Whether the caller holds any role in {@link #RECORDS_AUTHORITIES}.
     *
     * <p>Compared case-insensitively against the role name, matching
     * {@link #hasRole}. Role names are stored as written by whatever created the
     * account, and a case mismatch here would fail open into the same-department
     * fallback - silently, and looking exactly like a correct denial.
     */
    private boolean isRecordsAuthority(User user) {
        return user.getRoles().stream()
                .map(role -> role.getName() == null ? "" : role.getName().toUpperCase(Locale.ROOT))
                .anyMatch(RECORDS_AUTHORITIES::contains);
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
                .map(role -> role.getName() != null ? role.getName().toUpperCase(Locale.ROOT) : "")
                .collect(Collectors.toSet());

        return grants.stream().anyMatch(grant ->
                !grant.isDeleted()
                        && matchesGrantee(grant, user.getEmail(), roleNames)
                        && grantsRequiredLevel(grant.getAccessLevel(), requiredLevel));
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
