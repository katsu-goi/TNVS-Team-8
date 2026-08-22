package com.photonicomega.facilities.module.governance;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.ApprovalStatus;
import com.photonicomega.facilities.module.governance.domain.DecisionType;
import com.photonicomega.facilities.module.governance.domain.GovernanceRoles;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.repository.ApprovalDecisionRepository;
import com.photonicomega.facilities.module.governance.repository.ApprovalRequestRepository;
import com.photonicomega.facilities.module.governance.service.ApprovalGateService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Proves that when the gate refuses a call, it still <em>records</em> why.
 *
 * <p>Three defects in {@link ApprovalGateService} shared one shape: the code
 * wrote a terminal status and then threw an unchecked exception from the same
 * {@code @Transactional} method. Spring rolls such a transaction back and takes
 * the status write with it, so the caller was told the act had failed while the
 * database still claimed otherwise. Both outcomes were harmful:
 *
 * <ul>
 *   <li>A destructive act that failed halfway stayed {@code APPROVED} with a
 *       null execution error. It looked ready to run, and would have run again
 *       on the original authorisation - nobody signs off twice.</li>
 *   <li>A request whose window closed stayed {@code PENDING}. Because the gate
 *       permits only one open request per act per target, that dead row blocked
 *       the act on that target permanently, while staying invisible to the
 *       approver queue (which filters on the window).</li>
 * </ul>
 *
 * <p><b>This class must not be {@code @Transactional}.</b> That is not a
 * stylistic difference from {@link ApprovalGateTest}, it is the whole point. The
 * fix routes those writes through {@link
 * com.photonicomega.facilities.module.governance.service.ApprovalStateWriter},
 * whose methods are {@code REQUIRES_NEW}. A test-managed transaction is never
 * committed, so a {@code REQUIRES_NEW} transaction started underneath it cannot
 * see the rows it wrote - {@code findById} would come back empty and every
 * assertion here would pass or fail for reasons having nothing to do with the
 * behaviour under test. So these tests commit for real and clean up after
 * themselves.
 *
 * <p>Each test therefore asserts on a <em>reread</em> of the row rather than on
 * the object the service handed back: the returned instance belongs to a
 * persistence context that was discarded, and would happily report a status that
 * was never persisted. That is exactly the bug these tests exist to catch, so
 * trusting the return value would defeat them.
 */
@SpringBootTest
@ActiveProfiles("test")
class ApprovalStateTransitionTest {

    private static final String OFFICER = "txn.officer@test.local";
    private static final String MANAGER = "txn.manager@test.local";
    private static final String DPO = "txn.dpo@test.local";

    @Autowired
    private ApprovalGateService gate;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ApprovalRequestRepository requestRepository;

    @Autowired
    private ApprovalDecisionRepository decisionRepository;

    /** Used to hold one persistence context open across the fixture. See {@link #inOneTransaction}. */
    @Autowired
    private PlatformTransactionManager transactionManager;

    /** Everything this test committed, torn down in reverse order afterwards. */
    private final List<UUID> createdRequests = new ArrayList<>();

    @BeforeEach
    void seed() {
        inOneTransaction(() -> {
            seedUser(OFFICER, GovernanceRoles.COMPLIANCE_OFFICER);
            seedUser(MANAGER, GovernanceRoles.COMPLIANCE_MANAGER);
            seedUser(DPO, GovernanceRoles.DATA_PROTECTION_OFFICER);
        });
    }

    @AfterEach
    void cleanUp() {
        inOneTransaction(() -> {
            for (UUID requestId : createdRequests) {
                decisionRepository.deleteAll(decisionRepository.findByRequestIdOrderByDecidedAtAsc(requestId));
                requestRepository.findById(requestId).ifPresent(requestRepository::delete);
            }
            for (String email : List.of(OFFICER, MANAGER, DPO)) {
                userRepository.findByEmailAndDeletedFalse(email).ifPresent(userRepository::delete);
            }
        });
        // Outside the transaction, so a failed teardown cannot leave stale ids
        // behind to be retried against the next test.
        createdRequests.clear();
    }

    // ------------------------------------------------------------------
    // Defect 1: refusing a late decision used to leave the request PENDING
    // ------------------------------------------------------------------

    @Test
    @DisplayName("a decision arriving after the window closes lapses the request instead of leaving it pending")
    void lateDecisionRecordsExpiry() {
        ApprovalRequest raised = raise("Late signature target",
                "Retention window closed in 2024; requesting scheduled disposal.");
        closeWindowOf(raised.getId());

        BusinessRuleViolationException tooLate = assertThrows(BusinessRuleViolationException.class,
                () -> gate.decide(raised.getId(), DecisionType.APPROVE, "Signing off, sorry for the delay",
                        load(MANAGER), "10.0.0.1"));
        assertTrue(tooLate.getMessage().contains("approval window"),
                "the refusal should say the window closed: " + tooLate.getMessage());

        // The assertion the original code failed. It set EXPIRED and then threw,
        // so the status write was rolled back along with the exception and the
        // row stayed PENDING for ever.
        assertEquals(ApprovalStatus.EXPIRED, reread(raised.getId()).getStatus(),
                "a request refused for being out of time has to be recorded as EXPIRED, "
                        + "or the refusal is a lie the database will contradict");
        assertEquals(0, decisionRepository.countByRequestIdAndDecision(
                raised.getId(), DecisionType.APPROVE),
                "a refused late vote must not be recorded as a signature");
    }

    // ------------------------------------------------------------------
    // Defect 2: a lapsed request used to block its target permanently
    // ------------------------------------------------------------------

    @Test
    @DisplayName("a lapsed request does not permanently block its target from being requested again")
    void lapsedRequestDoesNotWedgeTheTarget() {
        String target = UUID.randomUUID().toString();
        ApprovalRequest first = raise(target, "Wedged target",
                "First request; retention has elapsed on this file.");
        closeWindowOf(first.getId());

        // Before the fix this threw "already awaiting approval" - and would have
        // gone on throwing it for ever, because the only thing that could clear
        // the blocking row was a sweep that nothing ever called.
        ApprovalRequest second = raise(target, "Wedged target",
                "Second request; the first was never picked up by an approver.");

        assertNotEquals(first.getId(), second.getId(), "a genuinely new request should have been raised");
        assertEquals(ApprovalStatus.PENDING, reread(second.getId()).getStatus());
        assertEquals(ApprovalStatus.EXPIRED, reread(first.getId()).getStatus(),
                "the dead request should have been lapsed on the way past, not silently ignored");
    }

    @Test
    @DisplayName("a still-open request does block a duplicate, so the tolerance above is narrow")
    void openRequestStillBlocksDuplicates() {
        // The counterpart to the test above: tolerating a lapsed duplicate must
        // not have widened into tolerating any duplicate, which would let a
        // requester raise two half-approved requests and use whichever gets a
        // signature first.
        String target = UUID.randomUUID().toString();
        raise(target, "Contested target", "First request, retention has elapsed.");

        BusinessRuleViolationException duplicate = assertThrows(BusinessRuleViolationException.class,
                () -> raise(target, "Contested target", "Second request while the first is still open."));
        assertTrue(duplicate.getMessage().contains("already awaiting approval"), duplicate.getMessage());
    }

    // ------------------------------------------------------------------
    // Defect 3: a failed destructive act used to stay re-runnable
    // ------------------------------------------------------------------

    @Test
    @DisplayName("an authorised act that fails is recorded FAILED and cannot be retried on the same signature")
    void failedExecutionIsRecordedAndNotRerunnable() {
        // The target does not resolve to a document, so the real disposal
        // executor throws - the realistic case where the target was removed by
        // some other path between authorisation and execution. No mock needed:
        // mocking the failure would also mock away the transaction boundary that
        // is the actual subject of this test.
        ApprovalRequest raised = raise("Target removed before execution",
                "Retention elapsed; disposing under schedule R-12.");
        gate.decide(raised.getId(), DecisionType.APPROVE, "Checked against open matters; cleared.",
                load(DPO), "10.0.0.2");
        assertEquals(ApprovalStatus.APPROVED, reread(raised.getId()).getStatus(),
                "precondition: one signature authorises a disposal");

        BusinessRuleViolationException failed = assertThrows(BusinessRuleViolationException.class,
                () -> gate.execute(raised.getId(), load(DPO), "10.0.0.2"));
        assertTrue(failed.getMessage().contains("could not be completed"), failed.getMessage());

        ApprovalRequest after = reread(raised.getId());
        assertEquals(ApprovalStatus.FAILED, after.getStatus(),
                "an act that was authorised but did not happen must not be left sitting in APPROVED");
        assertNotNull(after.getExecutionError(),
                "the reason it failed has to survive, or the next person cannot tell what went wrong");

        // The security consequence, stated as an assertion: APPROVED is the only
        // state execute() will act on, so leaving a failed act there made it
        // re-runnable indefinitely on one person's original sign-off.
        BusinessRuleViolationException retry = assertThrows(BusinessRuleViolationException.class,
                () -> gate.execute(raised.getId(), load(DPO), "10.0.0.2"));
        assertTrue(retry.getMessage().contains("not authorised"),
                "a failed act must need fresh authorisation, not a second attempt: " + retry.getMessage());
    }

    // ------------------------------------------------------------------
    // The sweep that makes EXPIRED reachable at all
    // ------------------------------------------------------------------

    @Test
    @DisplayName("the expiry sweep reaches lapsed requests and clears them out of the approver queue")
    void expirySweepLapsesAndDequeues() {
        ApprovalRequest raised = raise("Forgotten request",
                "Requesting disposal; retention schedule R-12 has elapsed.");
        closeWindowOf(raised.getId());

        assertTrue(gate.expireLapsed() >= 1, "the sweep should have found the lapsed request");

        assertEquals(ApprovalStatus.EXPIRED, reread(raised.getId()).getStatus());
        assertFalse(gate.queueFor(load(MANAGER)).stream().anyMatch(r -> r.getId().equals(raised.getId())),
                "a lapsed request must not still be offered to an approver");
        assertThrows(BusinessRuleViolationException.class,
                () -> gate.execute(raised.getId(), load(DPO), "10.0.0.3"),
                "an expired request must never be executable");
    }

    // ------------------------------------------------------------------
    // fixtures
    // ------------------------------------------------------------------

    /**
     * Runs {@code work} in a single transaction that really commits.
     *
     * <p>Only the fixture goes through here - never the code under test. Because
     * this class is deliberately not {@code @Transactional} (see the class
     * javadoc), every repository call otherwise gets its own session which closes
     * on return. {@code User.roles} is mapped {@code cascade = MERGE, PERSIST}, so
     * a {@code Role} looked up by one call and handed to the {@code save} in the
     * next is already detached by the time the cascade reaches it, and Hibernate
     * refuses:
     *
     * <pre>detached entity passed to persist: ...auth.domain.Role</pre>
     *
     * <p>Holding one session open across the lookup and the save keeps the role
     * managed, which makes the cascade a no-op. {@link ApprovalGateTest} never
     * meets this because its class-level {@code @Transactional} already does the
     * same thing for the whole test - which is exactly why the failure showed up
     * here and not there.
     *
     * <p>Passing the gate itself through this wrapper would defeat the class: its
     * {@code REQUIRES_NEW} writes have to commit on their own for any assertion
     * here to mean anything. The transaction manager is wrapped by hand rather
     * than injecting Boot's {@code TransactionTemplate} bean, which is
     * {@code @ConditionalOnSingleCandidate} and so is not guaranteed to exist.
     */
    private void inOneTransaction(Runnable work) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> work.run());
    }

    /** Raise a disposal request against a target that is deliberately not a real document. */
    private ApprovalRequest raise(String label, String justification) {
        return raise(UUID.randomUUID().toString(), label, justification);
    }

    private ApprovalRequest raise(String targetId, String label, String justification) {
        ApprovalRequest raised = gate.request(SensitiveAction.DOCUMENT_DISPOSE, "Document",
                targetId, label, justification, null, load(OFFICER));
        createdRequests.add(raised.getId());
        return raised;
    }

    /**
     * Push the approval window into the past, committed, so the gate sees a
     * genuinely lapsed row. Done directly rather than through the service
     * because no API lets a caller choose the window - which is correct, and is
     * why this has to reach past it.
     */
    private void closeWindowOf(UUID requestId) {
        ApprovalRequest request = requestRepository.findById(requestId).orElseThrow();
        request.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        requestRepository.save(request);
    }

    /** Reread from the database, never trusting an instance the service returned. */
    private ApprovalRequest reread(UUID requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalStateException("approval request vanished: " + requestId));
    }

    private void seedUser(String email, String... roleNames) {
        if (userRepository.findByEmailAndDeletedFalse(email).isPresent()) {
            return;
        }
        Set<Role> roles = new LinkedHashSet<>();
        for (String name : roleNames) {
            roles.add(role(name));
        }
        userRepository.save(User.builder()
                .firstName("Txn")
                .lastName("Tester")
                .email(email)
                .department("Compliance")
                .passwordHash("$2a$10$not-a-real-hash")
                .status(UserStatus.ACTIVE)
                .roles(roles)
                .build());
    }

    private Role role(String name) {
        return roleRepository.findByName(name).orElseGet(() -> roleRepository.save(Role.builder()
                .name(name)
                .displayName(name.replace('_', ' ').toLowerCase())
                .description("approval state transition test role")
                .build()));
    }

    private User load(String email) {
        return userRepository.findByEmailAndDeletedFalse(email)
                .orElseThrow(() -> new IllegalStateException("test user not seeded: " + email));
    }
}
