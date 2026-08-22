package com.photonicomega.facilities.module.governance.service;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Turns a destructive route into a request for permission.
 *
 * <p>Exists because the fifteen gated actions were reachable two ways. One went
 * through {@link ApprovalGateService} and needed two people; the other was the
 * original {@code DELETE} the screens had always called, which needed nobody. A gate
 * with a door left open beside it governs nothing, and the open door is the one the
 * existing UI was wired to.
 *
 * <p>Every such route now calls {@link #raise} instead of mutating. The HTTP contract
 * is deliberately unchanged - same verb, same path, same {@code ApiResponse}
 * envelope, still {@code 200} - because the alternative is a frontend that breaks on
 * a status code while the security property it is meant to express goes unexplained.
 * What changes is the meaning of the response, and the response says so: the
 * {@code pendingApproval} flag and the message both state that nothing has happened
 * yet and who has to sign.
 *
 * <p>The mutation itself is not moved or duplicated. It stays in exactly one place -
 * the action's {@code SensitiveActionExecutor}, reachable only from
 * {@code ApprovalGateService.execute}, reachable only from an APPROVED request. That
 * is the whole structural claim, and it is worth more than any check written at the
 * route: there is no code path left that destroys one of these things without an
 * approval, so no new controller can accidentally reintroduce one.
 *
 * <p>Two ways to supply the justification are accepted, a JSON body and a query
 * parameter, because {@code DELETE} with a request body is legal but awkward and not
 * every client sends one. Neither is optional: {@code ApprovalGateService.request}
 * refuses a blank or trivially short reason, and that refusal is the point rather
 * than an obstacle. "Deleted by admin, no reason recorded" is the audit entry this
 * whole subsystem exists to make impossible.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GovernedActionGateway {

    private final ApprovalGateService gate;

    /**
     * What a gated route hands back: the request that was raised, plus the sentence
     * to show the person who asked.
     */
    public record Raised(Map<String, Object> dto, String message) {
    }

    /**
     * Record an intent to carry out {@code action} against {@code targetId}. Mutates
     * nothing.
     *
     * @param body  the route's request body, or {@code null}; searched for the
     *              justification
     * @param reasonParam the {@code ?reason=} query parameter, or {@code null}; used
     *                    only when the body carries nothing
     */
    public Raised raise(SensitiveAction action, String targetType, String targetId,
                        String targetLabel, Map<String, Object> body, String reasonParam,
                        User requester) {
        return raiseWithPayload(action, targetType, targetId, targetLabel, body, reasonParam,
                payloadFrom(body), requester);
    }

    /**
     * As {@link #raise}, for the routes whose executor needs a detail the body does
     * not carry.
     *
     * <p>Used where the thing being approved is identified partly by the URL - the AI
     * instruction rollback takes its target version from the path, so the controller
     * has to build the payload the executor will read. Kept as a separate method
     * rather than a flag on {@link #raise} because a payload assembled by the
     * controller is exactly the kind of thing that should be visible at the call
     * site: it is what the approver is agreeing to, and it did not come from them.
     */
    public Raised raiseWithPayload(SensitiveAction action, String targetType, String targetId,
                                   String targetLabel, Map<String, Object> body, String reasonParam,
                                   String payloadJson, User requester) {
        String justification = justificationFrom(body, reasonParam, action);

        ApprovalRequest saved = gate.request(action, targetType, targetId, targetLabel,
                justification, payloadJson, requester);

        log.info("{} requested via governed route by {}: {} '{}' (approval {}, AI risk {})",
                action.name(), requester == null ? "unknown" : requester.getEmail(),
                targetType, targetLabel, saved.getId(), saved.getAiRiskLevel());

        return new Raised(describe(saved), prompt(saved));
    }

    /**
     * The sentence shown to the requester.
     *
     * <p>It states plainly that nothing happened, because the single most likely way
     * this design fails in practice is a user who reads "OK" and believes the clause
     * is gone. Naming the roles rather than saying "an approver" saves them guessing
     * who to go and ask.
     */
    public String prompt(ApprovalRequest r) {
        int needed = r.getRequiredApprovals();
        return r.getAction().getLabel() + " requested - nothing has been changed yet. It takes "
                + needed + " separate " + (needed == 1 ? "approval" : "approvals") + " from "
                + String.join(" or ", r.getAction().getApproverRoles())
                + " before it takes effect, and you cannot approve your own request. "
                + "Track it under Approvals (request " + r.getId() + ").";
    }

    /**
     * The pending request, in the shape the screens already read.
     *
     * <p>Kept small on purpose. This is returned from routes whose old response was a
     * bare success string, so anything here is new surface; the fields are the ones
     * needed to tell the user what is happening and to find the request again.
     */
    private Map<String, Object> describe(ApprovalRequest r) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("pendingApproval", true);
        dto.put("approvalRequestId", r.getId());
        dto.put("action", r.getAction().name());
        dto.put("actionLabel", r.getAction().getLabel());
        dto.put("status", r.getStatus().name());
        dto.put("targetType", r.getTargetType());
        dto.put("targetId", r.getTargetId());
        dto.put("targetLabel", r.getTargetLabel());
        dto.put("justification", r.getJustification());
        dto.put("requiredApprovals", r.getRequiredApprovals());
        dto.put("approvalCount", r.getApprovalCount());
        dto.put("approverRoles", r.getAction().getApproverRoles());
        dto.put("requestedAt", r.getRequestedAt());
        dto.put("expiresAt", r.getExpiresAt());
        // Advisory, and labelled as advisory wherever it is shown. The AI's verdict
        // never blocks a request - it decides what the approver is told.
        dto.put("aiRiskLevel", r.getAiRiskLevel() == null ? null : r.getAiRiskLevel().name());
        dto.put("aiRationale", r.getAiRationale());
        return dto;
    }

    /**
     * Finds the written reason, or explains what to send.
     *
     * <p>Several field names are accepted because the existing screens already use
     * different ones for the same idea. The error names the action and the field so a
     * caller that sends nothing gets a message worth acting on rather than a bare
     * 400.
     */
    private static String justificationFrom(Map<String, Object> body, String reasonParam,
                                            SensitiveAction action) {
        if (body != null) {
            for (String field : new String[]{"justification", "reason", "notes", "comment"}) {
                Object value = body.get(field);
                if (value instanceof String s && !s.isBlank()) {
                    return s;
                }
            }
        }
        if (reasonParam != null && !reasonParam.isBlank()) {
            return reasonParam;
        }
        throw new BusinessRuleViolationException(
                action.getLabel() + " needs a written reason before it can be requested. "
                        + action.getRationale()
                        + " Send it as {\"reason\":\"...\"} in the request body, or as ?reason=... - "
                        + "it becomes part of the permanent record of why this was done, and it is "
                        + "what the approver reads before deciding.");
    }

    /**
     * Extra detail some executors need, passed through untouched.
     *
     * <p>Only forwarded when the caller supplied it under {@code payloadJson}. The
     * gateway does not invent a payload from the rest of the body: an executor that
     * receives a payload it did not expect fails <em>after</em> approval, which is
     * the most expensive moment in the whole flow to discover a mistake.
     */
    private static String payloadFrom(Map<String, Object> body) {
        if (body == null) {
            return null;
        }
        Object payload = body.get("payloadJson");
        return payload instanceof String s && !s.isBlank() ? s : null;
    }
}
