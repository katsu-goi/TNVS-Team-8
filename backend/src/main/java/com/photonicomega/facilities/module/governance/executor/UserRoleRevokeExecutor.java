package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Revokes an authorised role from a user.
 *
 * <p>The interesting work here is the refusal, not the removal. Revoking a role is
 * the one gated action that can destroy the gate itself: if the last holder of an
 * approver role loses it, every pending request that needs that signature becomes
 * permanently unapprovable, and - because
 * {@link SensitiveAction#USER_ROLE_GRANT} is itself gated behind the very
 * signature that no longer exists - nobody can grant it back. The system would
 * deadlock in a way no amount of administrator access could undo, short of editing
 * the database by hand.
 *
 * <p>So this executor refuses to remove the last live holder of any role that
 * appears in any action's {@code approverRoles}. That set is computed from
 * {@link SensitiveAction} rather than hardcoded, because a hardcoded list would
 * drift the first time somebody adds a sixteenth gated action - and the drift would
 * only surface as an un-recoverable deadlock, months later, in production.
 *
 * <p>Refusing here is safe in a way that permitting is not: a refusal leaves the
 * request FAILED with a readable reason, and the administrator can revoke the role
 * after granting it to somebody else first.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class UserRoleRevokeExecutor implements SensitiveActionExecutor {

    /**
     * Every role that authorises at least one gated action. Computed once from the
     * policy enum so it cannot fall out of step with it.
     */
    private static final Set<String> ROLES_THAT_APPROVE_SOMETHING =
            Arrays.stream(SensitiveAction.values())
                    .flatMap(action -> action.getApproverRoles().stream())
                    .collect(Collectors.toCollection(LinkedHashSet::new));

    private final UserRepository userRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.USER_ROLE_REVOKE;
    }

    @Override
    @Transactional
    public String execute(ApprovalRequest request) {
        UUID userId = parseTargetId(request);
        String roleName = RoleNamePayload.requireFrom(request);

        User user = userRepository.findById(userId)
                .filter(candidate -> !candidate.isDeleted())
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "User " + userId + " no longer exists, so the approved role revocation "
                                + "cannot be carried out."));

        Optional<Role> held = user.getRoles().stream()
                .filter(candidate -> candidate.getName().equalsIgnoreCase(roleName))
                .findFirst();
        if (held.isEmpty()) {
            return "User " + user.getEmail() + " does not hold " + roleName + "; no change made.";
        }

        guardAgainstStrandingTheApprovalGate(user, roleName);

        user.getRoles().remove(held.get());
        userRepository.save(user);

        log.info("Approval {} revoked role {} from user {}; requested by {}",
                request.getId(), roleName, user.getEmail(), request.getRequestedByEmail());

        return "Revoked " + roleName + " from " + user.getEmail() + " (now holds "
                + user.getRoles().size() + " role(s)).";
    }

    /**
     * Refuses the revocation if it would remove the last person able to authorise
     * some gated action.
     */
    private void guardAgainstStrandingTheApprovalGate(User user, String roleName) {
        if (!ROLES_THAT_APPROVE_SOMETHING.contains(roleName)) {
            return;
        }

        List<User> holders = userRepository.findByRoleName(roleName);
        boolean someoneElseHoldsIt = holders.stream()
                .anyMatch(other -> !other.getId().equals(user.getId()));
        if (someoneElseHoldsIt) {
            return;
        }

        String affected = Arrays.stream(SensitiveAction.values())
                .filter(action -> action.getApproverRoles().contains(roleName))
                .map(SensitiveAction::getLabel)
                .collect(Collectors.joining(", "));

        throw new BusinessRuleViolationException(
                "Refusing to revoke " + roleName + " from " + user.getEmail()
                        + ": they are the last person holding it, and it is the approver role for: "
                        + affected + ". Removing it would leave those actions permanently "
                        + "unapprovable, and re-granting the role is itself gated behind an "
                        + "approval that would no longer be obtainable. Grant " + roleName
                        + " to another user first, then revoke this one.");
    }

    private UUID parseTargetId(ApprovalRequest request) {
        try {
            return UUID.fromString(request.getTargetId());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " targets '" + request.getTargetId()
                            + "', which is not a user id. A role revocation needs the account's UUID.");
        }
    }
}
