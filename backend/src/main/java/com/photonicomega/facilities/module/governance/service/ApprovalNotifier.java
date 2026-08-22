package com.photonicomega.facilities.module.governance.service;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.notification.RealtimeNotificationPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Tells the right people that a destructive act is waiting on them.
 *
 * <p>A two-person rule that nobody is told about degrades into a one-person rule
 * with extra steps: the requester walks over to a colleague and asks them to
 * click approve, which is exactly the collusion the control is supposed to make
 * visible. Pushing the request into the approver's own queue means the approval
 * originates with the approver.
 *
 * <p>The requester is deliberately excluded from the approver notification even
 * when they hold an approver role, so their own request never appears in their
 * own queue.
 *
 * <p>Delivery is best-effort and never throws. A notification that fails must not
 * roll back the approval request - the request in the database is the source of
 * truth and the queue endpoint reconciles anything missed.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ApprovalNotifier {

    private final UserRepository userRepository;
    private final RealtimeNotificationPublisher publisher;

    /** Push a new pending request to every eligible approver except the requester. */
    public void notifyApproversOfNewRequest(ApprovalRequest request) {
        Set<User> approvers = eligibleApprovers(request);
        if (approvers.isEmpty()) {
            // Fails closed: the request simply stays PENDING. Logged at WARN
            // because a gated action with no eligible approver is a
            // configuration problem that will otherwise surface as a user
            // complaining that approval never came.
            log.warn("No eligible approver holds any of {} - request {} to {} will stay pending",
                    request.getAction().getApproverRoles(), request.getId(), request.getAction());
            return;
        }
        Map<String, Object> payload = payloadFor(request,
                "Approval needed: " + request.getAction().getLabel(),
                request.getRequestedByName() + " is requesting to "
                        + request.getAction().getLabel().toLowerCase(java.util.Locale.ROOT)
                        + " '" + request.getTargetLabel() + "'. You are being asked to authorise it. "
                        + "You did not raise this request.");
        for (User approver : approvers) {
            publisher.publishToUser(approver.getEmail(), payload);
        }
        log.info("Approval request {} ({}) routed to {} eligible approver(s)",
                request.getId(), request.getAction(), approvers.size());
    }

    /** Tell the requester what was decided. */
    public void notifyRequesterOfOutcome(ApprovalRequest request) {
        publisher.publishToUser(request.getRequestedByEmail(), payloadFor(request,
                request.getAction().getLabel() + ": " + request.getStatus(),
                "Your request to " + request.getAction().getLabel().toLowerCase(java.util.Locale.ROOT)
                        + " '" + request.getTargetLabel() + "' is now "
                        + request.getStatus().name().toLowerCase(java.util.Locale.ROOT) + "."));
    }

    /**
     * Every active user holding a role that may approve this action, minus the
     * requester.
     */
    private Set<User> eligibleApprovers(ApprovalRequest request) {
        Set<User> found = new LinkedHashSet<>();
        for (String roleName : request.getAction().getApproverRoles()) {
            List<User> holders;
            try {
                holders = userRepository.findByRoleName(roleName);
            } catch (RuntimeException ex) {
                log.warn("Could not resolve holders of role {}: {}", roleName, ex.getMessage());
                continue;
            }
            for (User holder : holders) {
                boolean isRequester = holder.getId() != null
                        && holder.getId().equals(request.getRequestedById());
                if (!isRequester && holder.isAccountActive()) {
                    found.add(holder);
                }
            }
        }
        return found;
    }

    private Map<String, Object> payloadFor(ApprovalRequest request, String title, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", request.getId());
        m.put("type", "APPROVAL_REQUEST");
        m.put("severity", request.getAiRiskLevel() == null ? "INFO" : request.getAiRiskLevel().name());
        m.put("title", title);
        m.put("message", message);
        m.put("action", request.getAction().name());
        m.put("actionLabel", request.getAction().getLabel());
        m.put("status", request.getStatus().name());
        m.put("targetType", request.getTargetType());
        m.put("targetId", request.getTargetId());
        m.put("targetLabel", request.getTargetLabel());
        m.put("justification", request.getJustification());
        m.put("requestedBy", request.getRequestedByEmail());
        m.put("expiresAt", request.getExpiresAt());
        m.put("approvalsRequired", request.getRequiredApprovals());
        m.put("approvalsRecorded", request.getApprovalCount());
        m.put("aiRiskLevel", request.getAiRiskLevel());
        m.put("aiRationale", request.getAiRationale());
        m.put("read", false);
        m.put("createdAt", request.getRequestedAt());
        return m;
    }
}
