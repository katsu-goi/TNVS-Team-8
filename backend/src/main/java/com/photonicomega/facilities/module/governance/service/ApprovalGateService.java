package com.photonicomega.facilities.module.governance.service;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.auth.domain.AuditSeverity;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.service.AuditService;
import com.photonicomega.facilities.module.governance.domain.*;
import com.photonicomega.facilities.module.governance.repository.ApprovalDecisionRepository;
import com.photonicomega.facilities.module.governance.repository.ApprovalRequestRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The single chokepoint through which every irreversible act must pass.
 *
 * <p>Fifteen destructive endpoints previously mutated data the instant they were
 * called. They now call {@link #request} and return the pending approval, and
 * the mutation itself lives only in {@link #execute}, which cannot be reached
 * without a quorum of distinct approvers. Concentrating it here rather than
 * adding a check to each endpoint is deliberate: a per-endpoint check protects
 * exactly the endpoints someone remembered to protect.
 *
 * <h2>The invariants</h2>
 * <ol>
 *   <li>The requester must hold a role permitted to <em>ask</em> for the act.</li>
 *   <li>An approver must hold a role permitted to <em>authorise</em> it.</li>
 *   <li>An approver can never be the requester - compared on user id.</li>
 *   <li>An approver can never vote twice - enforced in the database, not only here.</li>
 *   <li>Any single rejection is terminal.</li>
 *   <li>Quorum is counted from decision rows, never from a stored counter.</li>
 *   <li>Execution runs at most once, and only from APPROVED.</li>
 * </ol>
 *
 * <p>Every one of those is a separate test in {@code ApprovalGateTest}, because
 * each is individually sufficient to turn this from a control into theatre while
 * still demonstrating correctly.
 */
@Service
@Slf4j
public class ApprovalGateService {

    /**
     * How long an approver has before a request lapses. Long enough to survive a
     * weekend, short enough that a stale authorisation cannot be executed months
     * later against a target whose circumstances have changed.
     */
    private static final int DEFAULT_WINDOW_HOURS = 72;

    private static final String MODULE = "GOVERNANCE";

    private final ApprovalRequestRepository requestRepository;
    private final ApprovalDecisionRepository decisionRepository;
    private final AuditService auditService;
    private final ApprovalRiskAdvisor riskAdvisor;
    private final ApprovalNotifier notifier;
    private final ApprovalStateWriter stateWriter;
    private final Map<SensitiveAction, SensitiveActionExecutor> executors =
            new EnumMap<>(SensitiveAction.class);

    public ApprovalGateService(ApprovalRequestRepository requestRepository,
                              ApprovalDecisionRepository decisionRepository,
                              AuditService auditService,
                              ApprovalRiskAdvisor riskAdvisor,
                              ApprovalNotifier notifier,
                              ApprovalStateWriter stateWriter,
                              List<SensitiveActionExecutor> discoveredExecutors) {
        this.requestRepository = requestRepository;
        this.decisionRepository = decisionRepository;
        this.auditService = auditService;
        this.riskAdvisor = riskAdvisor;
        this.notifier = notifier;
        this.stateWriter = stateWriter;
        for (SensitiveActionExecutor executor : discoveredExecutors) {
            SensitiveActionExecutor clash = executors.put(executor.supports(), executor);
            if (clash != null) {
                // Two executors for one action means the act that actually runs
                // depends on bean ordering. Refuse to start rather than let that
                // be discovered by an approved deletion doing the wrong thing.
                throw new IllegalStateException("Two executors registered for "
                        + executor.supports() + ": " + clash.getClass().getName()
                        + " and " + executor.getClass().getName());
            }
        }
        log.info("Approval gate armed: {} of {} sensitive actions have an executor",
                executors.size(), SensitiveAction.values().length);
    }

    // ------------------------------------------------------------------
    // REQUEST
    // ------------------------------------------------------------------

    /**
     * Record an intent to perform a destructive act. Nothing is mutated.
     *
     * @return the pending request the caller should show the user
     */
    @Transactional
    public ApprovalRequest request(SensitiveAction action, String targetType, String targetId,
                                  String targetLabel, String justification, String payloadJson,
                                  User requester) {
        if (requester == null) {
            throw new BusinessRuleViolationException(
                    "An anonymous caller cannot request a destructive action.");
        }
        if (justification == null || justification.isBlank()) {
            throw new BusinessRuleViolationException(
                    "A written justification is required before " + action.getLabel().toLowerCase(Locale.ROOT)
                            + " can be requested. " + action.getRationale());
        }
        if (justification.trim().length() < 10) {
            // A one-word justification defeats the point of asking. This is the
            // cheapest possible guard against "asdf" appearing in the record of
            // why the company destroyed a document.
            throw new BusinessRuleViolationException(
                    "The justification is too short to be meaningful. Describe why "
                            + action.getLabel().toLowerCase(Locale.ROOT) + " is necessary.");
        }
        Set<String> roles = roleNamesOf(requester);
        if (!action.canRequest(roles)) {
            throw new BusinessRuleViolationException("Your role is not permitted to request "
                    + action.getLabel().toLowerCase(Locale.ROOT) + ".");
        }

        LocalDateTime now = LocalDateTime.now();

        // One open request per act per target. Otherwise a requester can raise
        // several and shop for whichever collects a signature first.
        Optional<ApprovalRequest> alreadyOpen = requestRepository
                .findFirstByActionAndTargetIdAndStatus(action, targetId, ApprovalStatus.PENDING);
        if (alreadyOpen.isPresent()) {
            ApprovalRequest open = alreadyOpen.get();
            if (open.isExpired(now)) {
                // The window closed but the sweep has not reached it yet. Lapse it
                // here instead of letting a dead request wedge this target: the
                // guard immediately below is the only thing standing between a
                // missed sweep and a document nobody can ever act on again.
                stateWriter.markExpired(open.getId());
            } else {
                throw new BusinessRuleViolationException("A request to "
                        + action.getLabel().toLowerCase(Locale.ROOT)
                        + " this item is already awaiting approval (requested by "
                        + open.getRequestedByEmail() + ").");
            }
        }

        ApprovalRequest request = ApprovalRequest.builder()
                .action(action)
                .status(ApprovalStatus.PENDING)
                .targetType(targetType)
                .targetId(targetId)
                .targetLabel(targetLabel)
                .justification(justification.trim())
                .payloadJson(payloadJson)
                .requestedById(requester.getId())
                .requestedByEmail(requester.getEmail())
                .requestedByName(requester.getFullName())
                .requestedAt(now)
                .expiresAt(now.plusHours(DEFAULT_WINDOW_HOURS))
                .requiredApprovals(action.getRequiredApprovals())
                .approvalCount(0)
                .approvedAgainstAiAdvice(false)
                .build();

        // Advisory only. A BLOCK verdict does not stop the request being raised -
        // it changes what the approver is shown. AI recommends, human decides.
        ApprovalRiskAdvisor.Advice advice = riskAdvisor.assess(action, targetType, targetId,
                targetLabel, justification, requester);
        request.setAiRiskLevel(advice.level());
        request.setAiRationale(advice.rationale());

        ApprovalRequest saved = requestRepository.save(request);

        auditService.logWithSeverity(requester, "REQUEST_" + action.name(), MODULE,
                targetType, targetId,
                "Requested " + action.getLabel() + " for '" + targetLabel + "'. Justification: "
                        + saved.getJustification() + ". AI risk: " + advice.level() + ".",
                null, AuditSeverity.WARNING);

        notifier.notifyApproversOfNewRequest(saved);
        return saved;
    }

    // ------------------------------------------------------------------
    // DECIDE
    // ------------------------------------------------------------------

    /**
     * Cast one approver's vote. Reaching quorum only marks the request APPROVED;
     * it does not carry the act out.
     */
    @Transactional
    public ApprovalRequest decide(UUID requestId, DecisionType decision, String notes,
                                  User approver, String ipAddress) {
        if (approver == null) {
            throw new BusinessRuleViolationException("An anonymous caller cannot approve anything.");
        }
        ApprovalRequest request = requestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("ApprovalRequest", "id", requestId));

        if (request.getStatus() != ApprovalStatus.PENDING) {
            throw new BusinessRuleViolationException("This request is already "
                    + request.getStatus().name().toLowerCase(Locale.ROOT) + " and cannot be decided again.");
        }
        LocalDateTime now = LocalDateTime.now();
        if (request.isExpired(now)) {
            // Recorded through the state writer, not saved here: the throw below
            // is unchecked, so anything written in this transaction is rolled
            // back with it and the request would stay PENDING for ever.
            stateWriter.markExpired(requestId);
            throw new BusinessRuleViolationException("The approval window for this request closed on "
                    + request.getExpiresAt() + ". It must be requested again.");
        }

        // --- invariant 3: the requester is never an approver of their own request.
        // Compared on user id, not e-mail. An e-mail comparison is defeated by a
        // changed address or a difference in case, and comparing tokens or
        // sessions is defeated by simply logging in twice.
        if (approver.getId() != null && approver.getId().equals(request.getRequestedById())) {
            auditService.logWithSeverity(approver, "SELF_APPROVAL_BLOCKED", MODULE,
                    request.getTargetType(), request.getTargetId(),
                    "Blocked attempt to self-approve " + request.getAction().getLabel()
                            + " on '" + request.getTargetLabel() + "'.",
                    ipAddress, AuditSeverity.CRITICAL);
            throw new BusinessRuleViolationException(
                    "You raised this request, so you cannot also approve it. "
                            + request.getAction().getLabel() + " needs "
                            + request.getRequiredApprovals() + " separate "
                            + (request.getRequiredApprovals() == 1 ? "approver" : "approvers") + ".");
        }

        // --- invariant 2: approver authority.
        Set<String> roles = roleNamesOf(approver);
        if (!request.getAction().canApprove(roles)) {
            throw new BusinessRuleViolationException("Your role is not permitted to approve "
                    + request.getAction().getLabel().toLowerCase(Locale.ROOT)
                    + ". Required: " + String.join(" or ", request.getAction().getApproverRoles()) + ".");
        }

        // --- invariant 4: one vote per approver. Checked here for a clear error
        // message; also enforced by a unique constraint so it holds even if this
        // check is ever bypassed or races with a concurrent request.
        if (decisionRepository.existsByRequestIdAndDecidedById(requestId, approver.getId())) {
            throw new BusinessRuleViolationException(
                    "You have already recorded a decision on this request.");
        }

        decisionRepository.save(ApprovalDecision.builder()
                .requestId(requestId)
                .decision(decision)
                .decidedById(approver.getId())
                .decidedByEmail(approver.getEmail())
                .decidedByName(approver.getFullName())
                .decidedByRole(matchedApproverRole(request.getAction(), roles))
                .notes(notes)
                .decidedAt(now)
                .ipAddress(ipAddress)
                .aiRiskAtDecision(request.getAiRiskLevel())
                .build());

        // --- invariant 5: any rejection is terminal.
        if (decision == DecisionType.REJECT) {
            request.setStatus(ApprovalStatus.REJECTED);
            requestRepository.save(request);
            auditService.logWithSeverity(approver, "REJECT_" + request.getAction().name(), MODULE,
                    request.getTargetType(), request.getTargetId(),
                    "Rejected " + request.getAction().getLabel() + " for '" + request.getTargetLabel()
                            + "'. Notes: " + notes,
                    ipAddress, AuditSeverity.WARNING);
            notifier.notifyRequesterOfOutcome(request);
            return request;
        }

        // --- invariant 6: quorum counted from rows, never from a stored counter.
        long approvals = decisionRepository.countByRequestIdAndDecision(requestId, DecisionType.APPROVE);
        request.setApprovalCount((int) approvals);

        if (request.getAiRiskLevel() == AiRiskLevel.BLOCK) {
            // Not blocked - recorded. A human overrode the AI's advice, and that
            // fact is worth being able to search for later.
            request.setApprovedAgainstAiAdvice(true);
        }

        if (request.hasQuorum()) {
            request.setStatus(ApprovalStatus.APPROVED);
        }
        requestRepository.save(request);

        auditService.logWithSeverity(approver, "APPROVE_" + request.getAction().name(), MODULE,
                request.getTargetType(), request.getTargetId(),
                "Approved " + request.getAction().getLabel() + " for '" + request.getTargetLabel()
                        + "' (" + approvals + " of " + request.getRequiredApprovals() + ")."
                        + (request.isApprovedAgainstAiAdvice()
                        ? " Approved against AI advice: " + request.getAiRationale() : ""),
                ipAddress, request.isApprovedAgainstAiAdvice()
                        ? AuditSeverity.CRITICAL : AuditSeverity.WARNING);

        if (request.getStatus() == ApprovalStatus.APPROVED) {
            notifier.notifyRequesterOfOutcome(request);
        }
        return request;
    }

    /** The requester withdrawing their own request. Nobody else may cancel it. */
    @Transactional
    public ApprovalRequest cancel(UUID requestId, User actor) {
        ApprovalRequest request = requestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("ApprovalRequest", "id", requestId));
        if (!request.isPending()) {
            throw new BusinessRuleViolationException("Only a pending request can be withdrawn.");
        }
        if (actor == null || !actor.getId().equals(request.getRequestedById())) {
            throw new BusinessRuleViolationException("Only the person who raised a request may withdraw it.");
        }
        request.setStatus(ApprovalStatus.CANCELLED);
        requestRepository.save(request);
        auditService.log(actor, "CANCEL_" + request.getAction().name(), MODULE,
                request.getTargetType(), request.getTargetId(),
                "Withdrew request to " + request.getAction().getLabel(), null);
        return request;
    }

    // ------------------------------------------------------------------
    // EXECUTE
    // ------------------------------------------------------------------

    /**
     * Carry out an authorised act. This is the only code path in the application
     * that performs any of the fifteen destructive operations.
     *
     * <p>Executing is separated from approving so that reaching quorum is not
     * itself the mutation: an approver's click authorises, and the act is then
     * carried out and recorded as its own event with its own outcome.
     */
    @Transactional
    public ApprovalRequest execute(UUID requestId, User actor, String ipAddress) {
        ApprovalRequest request = requestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("ApprovalRequest", "id", requestId));

        // --- invariant 7: at most once, and only from APPROVED.
        if (request.getStatus() != ApprovalStatus.APPROVED) {
            throw new BusinessRuleViolationException("This act is not authorised. Current state: "
                    + request.getStatus() + ". " + request.getApprovalCount() + " of "
                    + request.getRequiredApprovals() + " approvals recorded.");
        }

        SensitiveActionExecutor executor = executors.get(request.getAction());
        if (executor == null) {
            // Fail loudly and leave the request APPROVED. Marking it EXECUTED
            // with nothing done would tell the audit trail the document was
            // disposed of when it is still there.
            throw new BusinessRuleViolationException("No executor is registered for "
                    + request.getAction() + ", so this act cannot be carried out. "
                    + "This is a configuration fault - report it to the platform team.");
        }

        try {
            String outcome = executor.execute(request);
            request.setStatus(ApprovalStatus.EXECUTED);
            request.setExecutedAt(LocalDateTime.now());
            request.setExecutedByEmail(actor != null ? actor.getEmail() : "system");
            request.setExecutionError(null);
            requestRepository.save(request);

            auditService.logWithSeverity(actor, "EXECUTE_" + request.getAction().name(), MODULE,
                    request.getTargetType(), request.getTargetId(),
                    request.getAction().getLabel() + " carried out on '" + request.getTargetLabel()
                            + "'. Authorised by: " + approverEmails(requestId) + ". Outcome: " + outcome,
                    ipAddress, AuditSeverity.CRITICAL);
            notifier.notifyRequesterOfOutcome(request);
            return request;
        } catch (RuntimeException ex) {
            log.error("Sensitive action {} failed for request {}: {}",
                    request.getAction(), requestId, ex.getMessage(), ex);
            // Recorded in its own transaction, because this one is about to be
            // rolled back by the throw below. A half-completed destructive act
            // left sitting in APPROVED with a null execution error looks ready to
            // run again, and would run again with no fresh authorisation.
            // Guarded so a failure to record cannot replace the real cause.
            try {
                stateWriter.markFailed(requestId, ex.getMessage());
            } catch (RuntimeException recordingFailure) {
                log.error("Could not record FAILED state for approval request {}: {}",
                        requestId, recordingFailure.getMessage(), recordingFailure);
            }
            auditService.logWithSeverity(actor, "EXECUTE_FAILED_" + request.getAction().name(), MODULE,
                    request.getTargetType(), request.getTargetId(),
                    request.getAction().getLabel() + " failed: " + ex.getMessage(),
                    ipAddress, AuditSeverity.CRITICAL);
            throw new BusinessRuleViolationException(request.getAction().getLabel()
                    + " was authorised but could not be completed: " + ex.getMessage());
        }
    }

    // ------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------

    /** Requests this user is eligible to decide, excluding their own. */
    @Transactional(readOnly = true)
    public List<ApprovalRequest> queueFor(User approver) {
        if (approver == null) {
            return List.of();
        }
        Set<String> roles = roleNamesOf(approver);
        return requestRepository.findOpenQueue(LocalDateTime.now()).stream()
                .filter(r -> r.getAction().canApprove(roles))
                .filter(r -> !approver.getId().equals(r.getRequestedById()))
                .filter(r -> !decisionRepository.existsByRequestIdAndDecidedById(r.getId(), approver.getId()))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ApprovalRequest> raisedBy(User requester) {
        return requester == null ? List.of()
                : requestRepository.findByRequestedByIdOrderByRequestedAtDesc(requester.getId());
    }

    @Transactional(readOnly = true)
    public ApprovalRequest byId(UUID id) {
        return requestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("ApprovalRequest", "id", id));
    }

    @Transactional(readOnly = true)
    public List<ApprovalDecision> decisionsFor(UUID requestId) {
        return decisionRepository.findByRequestIdOrderByDecidedAtAsc(requestId);
    }

    /** Lapse pending requests whose window closed. Driven by the scheduler. */
    @Transactional
    public int expireLapsed() {
        List<ApprovalRequest> lapsed = requestRepository.findLapsed(LocalDateTime.now());
        for (ApprovalRequest request : lapsed) {
            request.setStatus(ApprovalStatus.EXPIRED);
        }
        if (!lapsed.isEmpty()) {
            requestRepository.saveAll(lapsed);
            log.info("Expired {} approval request(s) that passed their window without quorum", lapsed.size());
        }
        return lapsed.size();
    }

    /**
     * Actions with no registered executor. Surfaced on the admin dashboard rather
     * than only logged, so a gated act that can be approved but never carried out
     * is visible before somebody waits three days for it.
     */
    public List<SensitiveAction> actionsWithoutExecutor() {
        return java.util.Arrays.stream(SensitiveAction.values())
                .filter(a -> !executors.containsKey(a))
                .toList();
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private Set<String> roleNamesOf(User user) {
        if (user == null || user.getRoles() == null) {
            return Set.of();
        }
        return user.getRoles().stream()
                .map(r -> r.getName() == null ? "" : r.getName().trim().toUpperCase(Locale.ROOT))
                .filter(n -> !n.isEmpty())
                .collect(Collectors.toSet());
    }

    private String matchedApproverRole(SensitiveAction action, Set<String> callerRoles) {
        return callerRoles.stream()
                .filter(action.getApproverRoles()::contains)
                .findFirst()
                .orElse(null);
    }

    private String approverEmails(UUID requestId) {
        return decisionRepository.findByRequestIdOrderByDecidedAtAsc(requestId).stream()
                .filter(d -> d.getDecision() == DecisionType.APPROVE)
                .map(ApprovalDecision::getDecidedByEmail)
                .collect(Collectors.joining(", "));
    }
}
