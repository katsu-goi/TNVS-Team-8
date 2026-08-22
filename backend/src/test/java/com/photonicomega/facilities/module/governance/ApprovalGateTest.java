package com.photonicomega.facilities.module.governance;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.compliance.domain.DisposalRequest;
import com.photonicomega.facilities.module.compliance.domain.DisposalStatus;
import com.photonicomega.facilities.module.compliance.repository.DisposalRequestRepository;
import com.photonicomega.facilities.module.compliance.service.ComplianceService;
import com.photonicomega.facilities.module.documents.domain.ClassificationLevel;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalDecision;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.ApprovalStatus;
import com.photonicomega.facilities.module.governance.domain.DecisionType;
import com.photonicomega.facilities.module.governance.domain.GovernanceRoles;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.repository.ApprovalDecisionRepository;
import com.photonicomega.facilities.module.governance.service.ApprovalGateService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Proves the two-person rule is a control rather than a demonstration.
 *
 * <p>Every test here corresponds to a specific way the control could be defeated
 * while still looking correct in a walkthrough. That framing matters: a demo of
 * this feature passes trivially - request as one user, approve as another, watch
 * the document disappear - and passes just as well against an implementation with
 * all four holes below wide open. So each hole gets its own test, and each test
 * asserts on the <em>document</em>, not just on the request status, because the
 * only claim worth verifying is that nothing was destroyed.
 *
 * <ol>
 *   <li>Self-approval from a second session or a second role.</li>
 *   <li>One approver voting twice to manufacture a quorum.</li>
 *   <li>An administrator approving a records act they should have no say in.</li>
 *   <li>A surviving unguarded path that still deletes directly.</li>
 * </ol>
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ApprovalGateTest {

    private static final String OFFICER = "gate.officer@test.local";
    private static final String OFFICER_WITH_BOTH_HATS = "gate.bothhats@test.local";
    private static final String MANAGER = "gate.manager@test.local";
    private static final String SECOND_MANAGER = "gate.manager2@test.local";
    private static final String DPO = "gate.dpo@test.local";
    private static final String SYSADMIN = "gate.sysadmin@test.local";

    @Autowired
    private ApprovalGateService gate;

    @Autowired
    private ComplianceService complianceService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private DocumentRepository documentRepository;

    @Autowired
    private DisposalRequestRepository disposalRequestRepository;

    @Autowired
    private ApprovalDecisionRepository decisionRepository;

    @BeforeEach
    void seed() {
        seedUser(OFFICER, "Compliance", GovernanceRoles.COMPLIANCE_OFFICER);
        // Deliberately holds both a requester role and an approver role. If the
        // four-eyes check were implemented as a role check - "does this person
        // hold an approver role?" - this user would sail through it.
        seedUser(OFFICER_WITH_BOTH_HATS, "Compliance",
                GovernanceRoles.COMPLIANCE_OFFICER, GovernanceRoles.COMPLIANCE_MANAGER);
        seedUser(MANAGER, "Compliance", GovernanceRoles.COMPLIANCE_MANAGER);
        seedUser(SECOND_MANAGER, "Compliance", GovernanceRoles.COMPLIANCE_MANAGER);
        seedUser(DPO, "Compliance", GovernanceRoles.DATA_PROTECTION_OFFICER);
        // The user's stated constraint: administering the platform must not
        // confer authority over the company's records.
        seedUser(SYSADMIN, "IT", GovernanceRoles.SYSTEM_ADMINISTRATOR, GovernanceRoles.SUPER_ADMIN);
    }

    // ------------------------------------------------------------------
    // Hole 1: self-approval
    // ------------------------------------------------------------------

    @Test
    @DisplayName("the requester cannot approve their own request, even holding an approver role")
    void requesterCannotApproveOwnRequest() {
        Document doc = seedDocument("Self-approval attempt");
        User bothHats = load(OFFICER_WITH_BOTH_HATS);

        ApprovalRequest request = gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                doc.getId().toString(), doc.getTitle(),
                "Retention window closed in 2024; disposing per schedule.", null, bothHats);

        assertEquals(ApprovalStatus.PENDING, request.getStatus());

        BusinessRuleViolationException blocked = assertThrows(BusinessRuleViolationException.class,
                () -> gate.decide(request.getId(), DecisionType.APPROVE, "Approving my own",
                        bothHats, "127.0.0.1"));
        assertTrue(blocked.getMessage().contains("cannot also approve"),
                "the refusal should say why, not just deny: " + blocked.getMessage());

        // The point of the test: nothing was destroyed.
        Document after = documentRepository.findById(doc.getId()).orElseThrow();
        assertFalse(after.isDeleted(), "document must survive a blocked self-approval");
        assertEquals(DocumentStatus.ARCHIVED, after.getStatus());
        assertEquals(0, decisionRepository.countByRequestIdAndDecision(
                request.getId(), DecisionType.APPROVE),
                "a blocked self-approval must not leave a vote behind");
    }

    // ------------------------------------------------------------------
    // Hole 2: one approver, two votes
    // ------------------------------------------------------------------

    @Test
    @DisplayName("one approver cannot reach a 2-signature quorum by voting twice")
    void approverCannotVoteTwice() {
        Document doc = seedDocument("Retention override target");
        User officer = load(OFFICER);
        User manager = load(MANAGER);

        // RETENTION_OVERRIDE requires two distinct approvers.
        ApprovalRequest request = gate.request(SensitiveAction.RETENTION_OVERRIDE, "Document",
                doc.getId().toString(), doc.getTitle(),
                "Regulator confirmed the shorter window applies to this class.", null, officer);
        assertEquals(2, request.getRequiredApprovals());

        ApprovalRequest afterFirstVote = gate.decide(request.getId(), DecisionType.APPROVE,
                "Agreed", manager, "10.0.0.1");
        assertEquals(ApprovalStatus.PENDING, afterFirstVote.getStatus(),
                "one signature must not satisfy a two-signature policy");
        assertEquals(1, afterFirstVote.getApprovalCount());

        BusinessRuleViolationException second = assertThrows(BusinessRuleViolationException.class,
                () -> gate.decide(request.getId(), DecisionType.APPROVE, "Agreed again",
                        manager, "10.0.0.1"));
        assertTrue(second.getMessage().contains("already recorded a decision"), second.getMessage());

        ApprovalRequest stillPending = gate.byId(request.getId());
        assertEquals(ApprovalStatus.PENDING, stillPending.getStatus());
        assertEquals(1, decisionRepository.countByRequestIdAndDecision(
                request.getId(), DecisionType.APPROVE),
                "the second vote must not have been recorded");

        // A genuinely different approver completes it.
        ApprovalRequest quorum = gate.decide(request.getId(), DecisionType.APPROVE,
                "Second signature", load(SECOND_MANAGER), "10.0.0.2");
        assertEquals(ApprovalStatus.APPROVED, quorum.getStatus());
        assertEquals(2, quorum.getApprovalCount());
    }

    @Test
    @DisplayName("the database itself refuses a duplicate vote, not only the service")
    void databaseRefusesDuplicateVote() {
        Document doc = seedDocument("Constraint check");
        User officer = load(OFFICER);
        User manager = load(MANAGER);

        ApprovalRequest request = gate.request(SensitiveAction.RETENTION_OVERRIDE, "Document",
                doc.getId().toString(), doc.getTitle(),
                "Second copy retained elsewhere; window may be shortened.", null, officer);
        gate.decide(request.getId(), DecisionType.APPROVE, "First", manager, "10.0.0.1");

        // Write a second vote for the same approver directly, bypassing the
        // service check entirely. If the unique constraint were only a comment
        // in the entity, this would succeed and the request would show two
        // approvals from one person - which reads as a satisfied quorum in any
        // list view. The constraint has to hold without application help.
        ApprovalDecision forged = ApprovalDecision.builder()
                .requestId(request.getId())
                .decision(DecisionType.APPROVE)
                .decidedById(manager.getId())
                .decidedByEmail(manager.getEmail())
                .decidedByName(manager.getFullName())
                .decidedAt(LocalDateTime.now())
                .build();

        assertThrows(DataIntegrityViolationException.class,
                () -> decisionRepository.saveAndFlush(forged),
                "uk_approval_one_vote_per_approver must reject a second vote from the same approver");
    }

    // ------------------------------------------------------------------
    // Hole 3: administering the system is not owning the records
    // ------------------------------------------------------------------

    @Test
    @DisplayName("a system administrator cannot approve a records disposal")
    void systemAdministratorCannotApproveDisposal() {
        Document doc = seedDocument("Admin overreach target");
        User officer = load(OFFICER);
        User sysadmin = load(SYSADMIN);

        ApprovalRequest request = gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                doc.getId().toString(), doc.getTitle(),
                "End of retention, no legal hold recorded against this file.", null, officer);

        BusinessRuleViolationException denied = assertThrows(BusinessRuleViolationException.class,
                () -> gate.decide(request.getId(), DecisionType.APPROVE, "Signing off",
                        sysadmin, "10.0.0.9"));
        assertTrue(denied.getMessage().contains("not permitted to approve"), denied.getMessage());

        Document after = documentRepository.findById(doc.getId()).orElseThrow();
        assertFalse(after.isDeleted());
    }

    @Test
    @DisplayName("no administrator role can approve any records-destroying action, by policy")
    void adminRolesAreAbsentFromRecordsApproverSets() {
        // A static assertion on the policy rather than on behaviour, so that a
        // future edit adding SUPER_ADMIN "just to unblock a demo" fails here
        // rather than silently reopening the hole.
        Set<String> adminRoles = Set.of(
                GovernanceRoles.SUPER_ADMIN,
                GovernanceRoles.SYSTEM_ADMINISTRATOR);
        for (SensitiveAction action : Set.of(SensitiveAction.DOCUMENT_DISPOSE,
                SensitiveAction.DOCUMENT_DELETE, SensitiveAction.RETENTION_OVERRIDE,
                SensitiveAction.DOCUMENT_DECLASSIFY)) {
            for (String adminRole : adminRoles) {
                assertFalse(action.getApproverRoles().contains(adminRole),
                        adminRole + " must not be able to approve " + action
                                + ": administering the platform is not owning the records");
                assertFalse(action.canApprove(Set.of(adminRole)),
                        adminRole + " must not pass canApprove for " + action);
            }
        }
    }

    @Test
    @DisplayName("every gated action needs at least one approver and names at least one approver role")
    void policyIsInternallyConsistent() {
        for (SensitiveAction action : SensitiveAction.values()) {
            assertTrue(action.getRequiredApprovals() >= 1,
                    action + " must require at least one approval");
            assertFalse(action.getApproverRoles().isEmpty(),
                    action + " has no approver role, so it could never be authorised");
            assertFalse(action.getRequesterRoles().isEmpty(),
                    action + " has no requester role, so it could never be raised");
            assertNotNull(action.getRationale(), action + " must state why it is gated");
            // An action whose only approver role is also its only requester role
            // would be satisfiable only by a second holder of that same role -
            // legitimate, but worth being deliberate about rather than accidental.
            assertTrue(action.getRequiredApprovals() <= 2,
                    action + " requires more approvals than the workflow supports");
        }
    }

    // ------------------------------------------------------------------
    // Execution is gated, once, and only from APPROVED
    // ------------------------------------------------------------------

    @Test
    @DisplayName("execution is unreachable without quorum and runs at most once")
    void executionIsGatedAndIdempotentlyGuarded() {
        Document doc = seedDocument("Execution guard target");
        User officer = load(OFFICER);

        ApprovalRequest request = gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                doc.getId().toString(), doc.getTitle(),
                "Retention elapsed; scheduled disposal for this quarter.", null, officer);

        BusinessRuleViolationException notAuthorised = assertThrows(
                BusinessRuleViolationException.class,
                () -> gate.execute(request.getId(), officer, "127.0.0.1"));
        assertTrue(notAuthorised.getMessage().contains("not authorised"), notAuthorised.getMessage());
        assertFalse(documentRepository.findById(doc.getId()).orElseThrow().isDeleted(),
                "an unapproved request must not be executable");

        gate.decide(request.getId(), DecisionType.APPROVE, "Cleared", load(DPO), "10.0.0.3");
        ApprovalRequest executed = gate.execute(request.getId(), load(DPO), "10.0.0.3");
        assertEquals(ApprovalStatus.EXECUTED, executed.getStatus());
        assertNotNull(executed.getExecutedAt());

        Document disposed = documentRepository.findById(doc.getId()).orElseThrow();
        assertTrue(disposed.isDeleted(), "an authorised disposal should actually happen");
        assertEquals(DocumentStatus.DELETED, disposed.getStatus());

        // Second execution must be refused, not silently repeated.
        assertThrows(BusinessRuleViolationException.class,
                () -> gate.execute(request.getId(), load(DPO), "10.0.0.3"));
    }

    @Test
    @DisplayName("a single rejection is terminal and destroys nothing")
    void rejectionIsTerminal() {
        Document doc = seedDocument("Rejection target");
        User officer = load(OFFICER);

        ApprovalRequest request = gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                doc.getId().toString(), doc.getTitle(),
                "Requesting disposal, believed out of retention.", null, officer);

        ApprovalRequest rejected = gate.decide(request.getId(), DecisionType.REJECT,
                "Still referenced by an open matter.", load(MANAGER), "10.0.0.4");
        assertEquals(ApprovalStatus.REJECTED, rejected.getStatus());

        assertFalse(documentRepository.findById(doc.getId()).orElseThrow().isDeleted());
        // A rejected request cannot be revived by a more agreeable approver.
        assertThrows(BusinessRuleViolationException.class,
                () -> gate.decide(request.getId(), DecisionType.APPROVE, "I disagree",
                        load(DPO), "10.0.0.5"));
        assertThrows(BusinessRuleViolationException.class,
                () -> gate.execute(request.getId(), load(MANAGER), "10.0.0.4"));
    }

    @Test
    @DisplayName("a request without a written justification is refused")
    void justificationIsMandatory() {
        Document doc = seedDocument("Unjustified");
        User officer = load(OFFICER);

        assertThrows(BusinessRuleViolationException.class,
                () -> gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                        doc.getId().toString(), doc.getTitle(), null, null, officer));
        assertThrows(BusinessRuleViolationException.class,
                () -> gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                        doc.getId().toString(), doc.getTitle(), "   ", null, officer));
        assertThrows(BusinessRuleViolationException.class,
                () -> gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                        doc.getId().toString(), doc.getTitle(), "asdf", null, officer));
    }

    @Test
    @DisplayName("a role not permitted to request cannot raise the request at all")
    void requesterAuthorityIsChecked() {
        Document doc = seedDocument("Wrong requester");
        BusinessRuleViolationException denied = assertThrows(BusinessRuleViolationException.class,
                () -> gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                        doc.getId().toString(), doc.getTitle(),
                        "I would like this gone please, it is cluttering my view.",
                        null, load(SYSADMIN)));
        assertTrue(denied.getMessage().contains("not permitted to request"), denied.getMessage());
    }

    // ------------------------------------------------------------------
    // Hole 4: the surviving unguarded path
    // ------------------------------------------------------------------

    @Test
    @DisplayName("the existing disposal endpoint now needs a second person too")
    void disposalThroughComplianceServiceNeedsASecondPerson() {
        Document doc = seedDocument("Legacy disposal path");
        User officer = load(OFFICER);

        DisposalRequest req = complianceService.requestDisposal(doc.getId(),
                "Retention period ended; approved for destruction under schedule R-12.", officer);
        assertEquals(DisposalStatus.PENDING, req.getStatus());
        assertNotNull(req.getApprovalRequestId(),
                "a disposal request must be backed by a governed approval");
        assertEquals(officer.getId(), req.getRequestedById(),
                "the requester has to be recorded or the four-eyes rule cannot be checked");

        // This is the exact sequence that used to destroy the document: the same
        // officer who asked, approving seconds later.
        BusinessRuleViolationException selfApproval = assertThrows(
                BusinessRuleViolationException.class,
                () -> complianceService.decideDisposal(req.getId(), true, "Approving", officer));
        assertTrue(selfApproval.getMessage().contains("cannot also approve"),
                selfApproval.getMessage());

        Document survived = documentRepository.findById(doc.getId()).orElseThrow();
        assertFalse(survived.isDeleted(), "the old one-person disposal path must no longer destroy anything");
        assertEquals(DisposalStatus.PENDING,
                disposalRequestRepository.findById(req.getId()).orElseThrow().getStatus());

        // A distinct authorised approver completes it, and only then is the
        // document disposed of.
        DisposalRequest decided = complianceService.decideDisposal(req.getId(), true,
                "Checked against open matters; cleared.", load(MANAGER));
        assertEquals(DisposalStatus.APPROVED, decided.getStatus());
        assertEquals(MANAGER, decided.getDecidedBy());

        Document disposed = documentRepository.findById(doc.getId()).orElseThrow();
        assertTrue(disposed.isDeleted());
        assertEquals(DocumentStatus.DELETED, disposed.getStatus());
    }

    @Test
    @DisplayName("a disposal row with no recorded requester fails closed rather than allowing")
    void legacyDisposalRowCannotBeDecided() {
        Document doc = seedDocument("Pre-gate row");
        // Simulates a row written before the gate existed: no requester, no
        // linked approval. "Cannot verify" must not degrade into "therefore allow".
        DisposalRequest legacy = disposalRequestRepository.save(DisposalRequest.builder()
                .documentId(doc.getId())
                .documentTitle(doc.getTitle())
                .reason("Written before the approval workflow existed")
                .status(DisposalStatus.PENDING)
                .build());

        BusinessRuleViolationException refused = assertThrows(BusinessRuleViolationException.class,
                () -> complianceService.decideDisposal(legacy.getId(), true, "Approve", load(MANAGER)));
        assertTrue(refused.getMessage().contains("predates the approval workflow"),
                refused.getMessage());
        assertFalse(documentRepository.findById(doc.getId()).orElseThrow().isDeleted());
    }

    @Test
    @DisplayName("the approval queue never shows a user their own request")
    void queueExcludesOwnRequests() {
        Document doc = seedDocument("Queue visibility");
        User bothHats = load(OFFICER_WITH_BOTH_HATS);

        ApprovalRequest own = gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                doc.getId().toString(), doc.getTitle(),
                "Retention closed; requesting scheduled disposal.", null, bothHats);

        // bothHats holds COMPLIANCE_MANAGER, so role-wise it could approve this.
        assertTrue(own.getAction().canApprove(Set.of(GovernanceRoles.COMPLIANCE_MANAGER)));
        assertFalse(gate.queueFor(bothHats).stream().anyMatch(r -> r.getId().equals(own.getId())),
                "a user must never be offered their own request to approve");
        assertTrue(gate.queueFor(load(MANAGER)).stream().anyMatch(r -> r.getId().equals(own.getId())),
                "an eligible approver should see it");
    }

    @Test
    @DisplayName("the same act cannot be requested twice on one target while one is pending")
    void duplicateOpenRequestsAreRefused() {
        Document doc = seedDocument("Duplicate shopping");
        User officer = load(OFFICER);
        gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document", doc.getId().toString(),
                doc.getTitle(), "First request, retention has elapsed.", null, officer);
        BusinessRuleViolationException dup = assertThrows(BusinessRuleViolationException.class,
                () -> gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                        doc.getId().toString(), doc.getTitle(),
                        "Second request in case the first is refused.", null, officer));
        assertTrue(dup.getMessage().contains("already awaiting approval"), dup.getMessage());
    }

    // ------------------------------------------------------------------
    // AI advises, it does not decide
    // ------------------------------------------------------------------

    @Test
    @DisplayName("an AI risk verdict never blocks a request or an approval by itself")
    void aiAdviceIsAdvisoryOnly() {
        // "litigation" is a disqualifying signal, so the advisor returns BLOCK.
        // BLOCK must still leave the request raisable and approvable - it changes
        // what the approver is shown and how the act is recorded, nothing else.
        Document doc = seedDocument("Pending litigation bundle");
        User officer = load(OFFICER);

        ApprovalRequest request = gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                doc.getId().toString(), doc.getTitle(),
                "Requesting disposal despite the matter reference in the title.", null, officer);
        assertEquals(ApprovalStatus.PENDING, request.getStatus(),
                "an AI verdict must not refuse a request outright");
        assertNotNull(request.getAiRiskLevel());

        ApprovalRequest approved = gate.decide(request.getId(), DecisionType.APPROVE,
                "Legal confirmed the hold was lifted; proceeding.", load(MANAGER), "10.0.0.7");
        assertEquals(ApprovalStatus.APPROVED, approved.getStatus(),
                "a human must be able to overrule the AI");
        assertTrue(approved.isApprovedAgainstAiAdvice(),
                "overruling the AI has to be recorded, so it can be reviewed later");
    }

    // ------------------------------------------------------------------
    // fixtures
    // ------------------------------------------------------------------

    private Document seedDocument(String title) {
        return documentRepository.save(Document.builder()
                .title(title)
                .fileName(title.toLowerCase().replace(' ', '-') + ".pdf")
                .fileType("application/pdf")
                .fileSize(1024L)
                .ownerEmail(OFFICER)
                .department("Compliance")
                .classificationLevel(ClassificationLevel.INTERNAL)
                .status(DocumentStatus.ARCHIVED)
                .versionNumber(1)
                .build());
    }

    private void seedUser(String email, String department, String... roleNames) {
        if (userRepository.findByEmailAndDeletedFalse(email).isPresent()) {
            return;
        }
        Set<Role> roles = new LinkedHashSet<>();
        for (String name : roleNames) {
            roles.add(role(name));
        }
        userRepository.save(User.builder()
                .firstName("Gate")
                .lastName("Tester")
                .email(email)
                .department(department)
                .passwordHash("$2a$10$not-a-real-hash")
                .status(UserStatus.ACTIVE)
                .roles(roles)
                .build());
    }

    private Role role(String name) {
        return roleRepository.findByName(name).orElseGet(() -> roleRepository.save(Role.builder()
                .name(name)
                .displayName(name.replace('_', ' ').toLowerCase())
                .description("approval gate test role")
                .build()));
    }

    private User load(String email) {
        return userRepository.findByEmailAndDeletedFalse(email)
                .orElseThrow(() -> new IllegalStateException("test user not seeded: " + email));
    }
}
