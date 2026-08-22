package com.photonicomega.facilities.module.governance;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.documents.service.DocumentAccessPolicy;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Proves that whoever is asked to authorise destroying a document can read it first.
 *
 * <p>{@link SensitiveAction#DOCUMENT_DISPOSE} is approved by a
 * {@code COMPLIANCE_MANAGER}, a {@code DATA_PROTECTION_OFFICER} or a
 * {@code LEGAL_COUNSEL}, and the action is not scoped to a department - any of them
 * can be asked about any document in the company. {@link DocumentAccessPolicy}
 * decides visibility from a separate list of role names, and falls through to
 * "same department only" for any role that list does not mention. The two were
 * written against different vocabularies, and neither is wrong on its own.
 *
 * <p>Together they produce an approver who is shown a request to permanently destroy
 * a record, and cannot open the record. The signature is still collected, the audit
 * entry still says two people agreed, and the second person could not see what they
 * were agreeing to. That is not a weaker version of the two-person rule - it is the
 * two-person rule producing false assurance, which is worse than not having it, since
 * the audit trail now testifies to a review that did not happen.
 *
 * <p>The invariant asserted here is deliberately blunt: if a role can approve the
 * destruction, declassification or retention-override of <em>any</em> document, that
 * role can view and download <em>every</em> document. It has to be blunt, because the
 * actions are unscoped - narrowing the read permission would require first narrowing
 * which documents each approver can be asked about, which is a much larger change to
 * {@link SensitiveAction} than to the access policy.
 *
 * <p>This does not contradict the rule that administering the platform confers no
 * authority over records - see {@link #administratorsGainNothingFromThis()}. These
 * are records authorities being given the reading rights their records duties already
 * imply. The system administrator is not one of them and gains nothing here.
 */
@SpringBootTest
@ActiveProfiles("test")
class DocumentApproverCanReadRecordTest {

    /**
     * Modules whose actions act on documents.
     *
     * <p>Selected by module rather than by listing the four action names, so an action
     * added to either module later is covered without anyone remembering this file
     * exists.
     */
    private static final Set<String> DOCUMENT_MODULES = Set.of("COMPLIANCE", "DOCUMENTS");

    @Autowired
    private DocumentAccessPolicy accessPolicy;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private DocumentRepository documentRepository;

    @Test
    @DisplayName("every approver of a document action can view and download every document")
    void approversCanReadWhatTheyAreAskedToDestroy() {
        List<Document> documents = documentRepository.findAll();
        assertFalse(documents.isEmpty(),
                "No documents are seeded, so this test would pass by having nothing to check.");

        List<String> blind = new ArrayList<>();

        for (String role : approverRolesOverDocuments()) {
            for (User approver : liveHolders(role)) {
                for (Document document : documents) {
                    boolean canView = accessPolicy.canView(approver, document);
                    boolean canDownload = accessPolicy.canDownload(approver, document);
                    if (!canView || !canDownload) {
                        blind.add(role + " (" + approver.getEmail() + ", dept "
                                + approver.getDepartment() + ") cannot "
                                + (canView ? "download" : canDownload ? "view" : "view or download")
                                + " '" + document.getTitle() + "' (dept "
                                + document.getDepartment() + ", "
                                + document.getClassificationLevel() + ")");
                    }
                }
            }
        }

        assertTrue(blind.isEmpty(),
                "These accounts can approve the permanent destruction, deletion, declassification "
                        + "or retention-override of a document, but cannot open the document they "
                        + "would be signing off. Their signature would be collected anyway, and the "
                        + "audit trail would record a second review that nobody was able to perform. "
                        + "Add the role to DocumentAccessPolicy's cross-department governance read "
                        + "set, or scope the SensitiveAction so it can only be raised for documents "
                        + "the approver can already see.\n\n  "
                        + String.join("\n  ", blind) + "\n");
    }

    @Test
    @DisplayName("the pending disposal request's own approvers can read the document it targets")
    void theSeededDisposalIsNotSignedBlind() {
        // The concrete case, kept separate from the sweep above because it is the one
        // that is already sitting in the database waiting for a decision. A fresh
        // install ships with a PENDING disposal for an archived Procurement record,
        // and every eligible approver is in Compliance or Legal - so under a
        // same-department fallback, not one of them can open it. If the general
        // invariant above is ever relaxed, this narrower case must still hold.
        Document target = documentRepository.findAll().stream()
                .filter(d -> "Legacy Vendor Records 2019".equals(d.getTitle()))
                .findFirst()
                .orElse(null);
        if (target == null) {
            return; // sample data not seeded in this profile; the sweep above still applies
        }

        List<String> blind = new ArrayList<>();
        for (String role : SensitiveAction.DOCUMENT_DISPOSE.getApproverRoles()) {
            for (User approver : liveHolders(role)) {
                if (!accessPolicy.canView(approver, target)
                        || !accessPolicy.canDownload(approver, target)) {
                    blind.add(role + " (" + approver.getEmail() + ")");
                }
            }
        }

        assertTrue(blind.isEmpty(),
                "A disposal request for '" + target.getTitle() + "' (department "
                        + target.getDepartment() + ") is pending in a fresh install, and these "
                        + "eligible approvers cannot read it: " + String.join(", ", blind)
                        + ". The first governance decision a new operator is asked to make would "
                        + "be one they cannot inform themselves about.\n");
    }

    @Test
    @DisplayName("granting approvers read access does not give administrators records access")
    void administratorsGainNothingFromThis() {
        // The guard on the fix above. Widening DocumentAccessPolicy is the obvious way
        // to satisfy this test, and the obvious lazy way to do it is to widen it for
        // administrators too, since they are the accounts that most often complain
        // about not seeing things. That would break the rule the whole records design
        // rests on: administering the platform is not authority over the company's
        // records. SUPER_ADMIN keeps its existing full access - it is the break-glass
        // account and is out of scope here - but SYSTEM_ADMINISTRATOR and
        // SECURITY_OFFICER must gain no document reach from being seeded.
        List<Document> confidential = documentRepository.findAll().stream()
                .filter(d -> d.getClassificationLevel() != null
                        && !"PUBLIC".equals(d.getClassificationLevel().name()))
                .toList();
        if (confidential.isEmpty()) {
            return;
        }

        List<String> overreaching = new ArrayList<>();
        for (String role : List.of("SYSTEM_ADMINISTRATOR", "SECURITY_OFFICER")) {
            for (User admin : liveHolders(role)) {
                for (Document document : confidential) {
                    // Own-department documents are legitimate for anyone; the concern is
                    // blanket reach across the catalogue.
                    boolean ownDepartment = admin.getDepartment() != null
                            && admin.getDepartment().equalsIgnoreCase(document.getDepartment());
                    if (!ownDepartment && accessPolicy.canView(admin, document)) {
                        overreaching.add(role + " (" + admin.getEmail() + ") can read '"
                                + document.getTitle() + "' (" + document.getClassificationLevel()
                                + ", dept " + document.getDepartment() + ")");
                    }
                }
            }
        }

        assertTrue(overreaching.isEmpty(),
                "Administering the system is not authority over the company's records, but these "
                        + "administrative accounts can read classified documents outside their own "
                        + "department. If this appeared while fixing approver visibility, the fix "
                        + "was too broad.\n\n  "
                        + String.join("\n  ", overreaching) + "\n");
    }

    /** Every role that can approve an action in a document-bearing module. */
    private static Set<String> approverRolesOverDocuments() {
        Set<String> roles = new LinkedHashSet<>();
        for (SensitiveAction action : SensitiveAction.values()) {
            if (DOCUMENT_MODULES.contains(action.getModule())) {
                roles.addAll(action.getApproverRoles());
            }
        }
        return roles;
    }

    private List<User> liveHolders(String roleName) {
        return userRepository.findByRoleName(roleName).stream()
                .filter(User::isAccountActive)
                .toList();
    }
}
