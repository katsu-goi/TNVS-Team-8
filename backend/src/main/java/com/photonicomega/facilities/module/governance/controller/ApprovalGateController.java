package com.photonicomega.facilities.module.governance.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalDecision;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.ApprovalStatus;
import com.photonicomega.facilities.module.governance.domain.DecisionType;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.ApprovalGateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The HTTP surface of the approval gate - one shared inbox for every irreversible
 * act in the system.
 *
 * <p>There is deliberately no per-module copy of this controller. Fifteen
 * destructive operations across documents, contracts, identity, security and AI
 * configuration all raise the same {@code ApprovalRequest} and are decided
 * through the same three endpoints, so a reviewer has one place to look and a
 * new gated action inherits the whole workflow without new routes.
 *
 * <p>Authority is not expressed in the URL. {@code /v1/governance/**} is open to
 * any authenticated user because a prefix rule cannot say "this person may
 * approve <em>this</em> request but not that one" - that depends on the action,
 * the caller's roles, and whether the caller is the requester. All three are
 * checked per request inside {@link ApprovalGateService}, which is strictly
 * narrower than a prefix rule: {@link #queue} returns only what the caller is
 * eligible to decide, and a vote from an unauthorised role is refused with its
 * reason rather than silently ignored.
 *
 * <p>Responses are {@code LinkedHashMap} DTOs rather than entities, matching the
 * rest of the codebase and staying safe under {@code open-in-view: false}.
 */
@RestController
@RequestMapping("/v1/governance")
@RequiredArgsConstructor
@Tag(name = "Governance & Approvals",
        description = "Two-person approval workflow for every irreversible action")
public class ApprovalGateController {

    private final ApprovalGateService gate;
    private final UserRepository userRepository;

    // ------------------------------------------------------------------
    // Policy catalogue
    // ------------------------------------------------------------------

    /**
     * The full policy: what is gated, who may ask, who may authorise, how many
     * signatures, and why. Served rather than hardcoded in the client so the
     * confirmation dialog states the real rule - a UI that says "requires 2
     * approvals" while the server requires 1 is worse than no message at all.
     */
    @GetMapping("/actions")
    @Operation(summary = "Catalogue of gated actions, with quorum and rationale")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> actions(
            @AuthenticationPrincipal UserDetails userDetails) {
        Set<String> roles = roleNamesOf(resolveUser(userDetails));
        List<Map<String, Object>> catalogue = java.util.Arrays.stream(SensitiveAction.values())
                .map(a -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("action", a.name());
                    m.put("label", a.getLabel());
                    m.put("module", a.getModule());
                    m.put("requiredApprovals", a.getRequiredApprovals());
                    m.put("requesterRoles", a.getRequesterRoles());
                    m.put("approverRoles", a.getApproverRoles());
                    m.put("rationale", a.getRationale());
                    // Lets the client hide a button the caller could never use,
                    // instead of offering it and surfacing a 422 afterwards.
                    m.put("canRequest", a.canRequest(roles));
                    m.put("canApprove", a.canApprove(roles));
                    return m;
                })
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(catalogue, "Gated action catalogue"));
    }

    // ------------------------------------------------------------------
    // Queues
    // ------------------------------------------------------------------

    @GetMapping("/approvals/queue")
    @Operation(summary = "Requests awaiting this user's decision (never their own)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> queue(
            @AuthenticationPrincipal UserDetails userDetails) {
        List<Map<String, Object>> result = gate.queueFor(resolveUser(userDetails)).stream()
                .map(this::toRequestDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Approval queue retrieved"));
    }

    @GetMapping("/approvals/mine")
    @Operation(summary = "Requests this user raised, with their current state")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> mine(
            @AuthenticationPrincipal UserDetails userDetails) {
        List<Map<String, Object>> result = gate.raisedBy(resolveUser(userDetails)).stream()
                .map(this::toRequestDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result, "Your requests retrieved"));
    }

    /**
     * One request with every vote cast on it. The decision list is the audit
     * answer to "who agreed to this", which a counter cannot provide.
     */
    @GetMapping("/approvals/{id}")
    @Operation(summary = "One approval request with its full decision trail")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> byId(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        ApprovalRequest request = gate.byId(id);
        User caller = resolveUser(userDetails);
        Map<String, Object> dto = toRequestDto(request);
        dto.put("decisions", gate.decisionsFor(id).stream()
                .map(this::toDecisionDto).collect(Collectors.toList()));
        dto.put("callerIsRequester", caller != null
                && caller.getId().equals(request.getRequestedById()));
        dto.put("callerCanApprove", caller != null
                && request.getAction().canApprove(roleNamesOf(caller))
                && !caller.getId().equals(request.getRequestedById()));
        return ResponseEntity.ok(ApiResponse.success(dto, "Approval request retrieved"));
    }

    // ------------------------------------------------------------------
    // Raise
    // ------------------------------------------------------------------

    /**
     * Raise a request for a gated act. Nothing is mutated - the response is a
     * PENDING request that a different person has to sign off.
     */
    @PostMapping("/approvals")
    @Operation(summary = "Request a gated action (records intent; mutates nothing)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> raise(
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        String actionName = str(body.get("action"));
        SensitiveAction action = SensitiveAction.from(actionName)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "'" + actionName + "' is not a gated action. Valid actions are listed at "
                                + "GET /v1/governance/actions."));
        String targetId = str(body.get("targetId"));
        if (targetId == null || targetId.isBlank()) {
            throw new BusinessRuleViolationException("targetId is required: an approval has to name "
                    + "the specific thing it authorises.");
        }
        ApprovalRequest saved = gate.request(
                action,
                str(body.get("targetType")) == null ? "Unknown" : str(body.get("targetType")),
                targetId,
                str(body.get("targetLabel")),
                str(body.get("justification")),
                str(body.get("payloadJson")),
                resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toRequestDto(saved),
                approvalPrompt(saved)));
    }

    // ------------------------------------------------------------------
    // Decide
    // ------------------------------------------------------------------

    @PostMapping("/approvals/{id}/approve")
    @Operation(summary = "Record an approval vote (refused if you raised the request)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approve(
            @PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails, HttpServletRequest http) {
        ApprovalRequest decided = gate.decide(id, DecisionType.APPROVE,
                body == null ? null : str(body.get("notes")),
                resolveUser(userDetails), clientIp(http));
        String message = decided.getStatus() == ApprovalStatus.APPROVED
                ? "Authorised. " + decided.getAction().getLabel() + " can now be carried out."
                : "Approval recorded (" + decided.getApprovalCount() + " of "
                        + decided.getRequiredApprovals() + "). Still awaiting a further approver.";
        return ResponseEntity.ok(ApiResponse.success(toRequestDto(decided), message));
    }

    @PostMapping("/approvals/{id}/reject")
    @Operation(summary = "Reject a request; a single rejection is final")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reject(
            @PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails, HttpServletRequest http) {
        ApprovalRequest decided = gate.decide(id, DecisionType.REJECT,
                body == null ? null : str(body.get("notes")),
                resolveUser(userDetails), clientIp(http));
        return ResponseEntity.ok(ApiResponse.success(toRequestDto(decided),
                decided.getAction().getLabel() + " rejected. Nothing was changed."));
    }

    @PostMapping("/approvals/{id}/cancel")
    @Operation(summary = "Withdraw your own pending request")
    public ResponseEntity<ApiResponse<Map<String, Object>>> cancel(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        ApprovalRequest cancelled = gate.cancel(id, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(toRequestDto(cancelled), "Request withdrawn"));
    }

    // ------------------------------------------------------------------
    // Execute
    // ------------------------------------------------------------------

    /**
     * Carry out an act that has reached quorum. Separate from approving so that
     * an approver's signature authorises the act rather than performing it, and
     * so the outcome is recorded as its own event with its own success or failure.
     */
    @PostMapping("/approvals/{id}/execute")
    @Operation(summary = "Carry out an authorised action (only from APPROVED)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> execute(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails,
            HttpServletRequest http) {
        ApprovalRequest executed = gate.execute(id, resolveUser(userDetails), clientIp(http));
        return ResponseEntity.ok(ApiResponse.success(toRequestDto(executed),
                executed.getAction().getLabel() + " completed."));
    }

    // ------------------------------------------------------------------
    // Operational visibility
    // ------------------------------------------------------------------

    /**
     * Gated actions with no registered executor - approvable but not performable.
     * Exposed rather than only logged at startup, so the gap is visible before
     * someone waits three days for an approval that can never complete.
     */
    @GetMapping("/health")
    @Operation(summary = "Gated actions that have no executor wired up")
    public ResponseEntity<ApiResponse<Map<String, Object>>> health() {
        List<SensitiveAction> orphans = gate.actionsWithoutExecutor();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("gatedActions", SensitiveAction.values().length);
        m.put("executable", SensitiveAction.values().length - orphans.size());
        m.put("withoutExecutor", orphans.stream().map(Enum::name).toList());
        return ResponseEntity.ok(ApiResponse.success(m,
                orphans.isEmpty() ? "Every gated action has an executor"
                        : orphans.size() + " gated action(s) cannot yet be carried out"));
    }

    // ------------------------------------------------------------------
    // DTO mappers
    // ------------------------------------------------------------------

    private Map<String, Object> toRequestDto(ApprovalRequest r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("action", r.getAction().name());
        m.put("actionLabel", r.getAction().getLabel());
        m.put("module", r.getAction().getModule());
        m.put("rationale", r.getAction().getRationale());
        m.put("status", r.getStatus());
        m.put("targetType", r.getTargetType());
        m.put("targetId", r.getTargetId());
        m.put("targetLabel", r.getTargetLabel());
        m.put("justification", r.getJustification());
        m.put("requestedByEmail", r.getRequestedByEmail());
        m.put("requestedByName", r.getRequestedByName());
        m.put("requestedAt", r.getRequestedAt());
        m.put("expiresAt", r.getExpiresAt());
        m.put("requiredApprovals", r.getRequiredApprovals());
        m.put("approvalCount", r.getApprovalCount());
        m.put("approverRoles", r.getAction().getApproverRoles());
        m.put("executedAt", r.getExecutedAt());
        m.put("executedByEmail", r.getExecutedByEmail());
        m.put("executionError", r.getExecutionError());
        // AI fields are labelled as advice throughout. The client renders them as
        // a recommendation next to the human decision, never as the outcome.
        m.put("aiRiskLevel", r.getAiRiskLevel());
        m.put("aiRationale", r.getAiRationale());
        m.put("aiAdviceIsAdvisoryOnly", true);
        m.put("approvedAgainstAiAdvice", r.isApprovedAgainstAiAdvice());
        return m;
    }

    private Map<String, Object> toDecisionDto(ApprovalDecision d) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", d.getId());
        m.put("decision", d.getDecision());
        m.put("decidedByEmail", d.getDecidedByEmail());
        m.put("decidedByName", d.getDecidedByName());
        m.put("decidedByRole", d.getDecidedByRole());
        m.put("notes", d.getNotes());
        m.put("decidedAt", d.getDecidedAt());
        m.put("aiRiskAtDecision", d.getAiRiskAtDecision());
        return m;
    }

    /** Tells the requester in plain terms what still has to happen, and who does it. */
    private String approvalPrompt(ApprovalRequest r) {
        int needed = r.getRequiredApprovals();
        return r.getAction().getLabel() + " requested. It will not take effect until "
                + needed + " separate " + (needed == 1 ? "approver" : "approvers")
                + " (" + String.join(" or ", r.getAction().getApproverRoles())
                + ") sign it off. You cannot approve your own request.";
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) {
            return null;
        }
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }

    private Set<String> roleNamesOf(User user) {
        if (user == null || user.getRoles() == null) {
            return Set.of();
        }
        return user.getRoles().stream()
                .map(r -> r.getName() == null ? "" : r.getName().trim().toUpperCase(Locale.ROOT))
                .filter(n -> !n.isEmpty())
                .collect(Collectors.toSet());
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
