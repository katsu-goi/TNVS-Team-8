package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Grants an authorised role to a user.
 *
 * <p>This is the executor that keeps every other gate honest. Without it, the
 * fourteen other gated actions would be defeated in one move: an administrator who
 * cannot approve a document disposal could simply grant themselves
 * RECORDS_OFFICER and then approve it as that. Gating the grant closes the loop -
 * the only way to acquire authority over the company's records is for somebody who
 * already holds records authority to say so, in writing, on the record.
 *
 * <p>Note what is <em>not</em> checked here: whether the role being granted is a
 * powerful one. That judgement belongs in {@link SensitiveAction}'s approver list
 * and in the human who signs, not in a hardcoded blocklist that would silently
 * disagree with the policy enum. See {@link SensitiveActionExecutor} - an executor
 * that second-guesses the gate can leave a request permanently stuck in APPROVED.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class UserRoleGrantExecutor implements SensitiveActionExecutor {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.USER_ROLE_GRANT;
    }

    @Override
    @Transactional
    public String execute(ApprovalRequest request) {
        UUID userId = parseTargetId(request);
        String roleName = RoleNamePayload.requireFrom(request);

        User user = userRepository.findById(userId)
                .filter(candidate -> !candidate.isDeleted())
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "User " + userId + " no longer exists, so the approved role grant cannot "
                                + "be carried out."));

        Role role = roleRepository.findByName(roleName)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "Role '" + roleName + "' does not exist. Granting an unknown role would "
                                + "silently do nothing while the audit trail claimed the privilege "
                                + "had been given."));

        boolean alreadyHeld = user.getRoles().stream()
                .anyMatch(held -> held.getName().equalsIgnoreCase(roleName));
        if (alreadyHeld) {
            return "User " + user.getEmail() + " already holds " + roleName + "; no change made.";
        }

        user.getRoles().add(role);
        userRepository.save(user);

        log.info("Approval {} granted role {} to user {}; requested by {}",
                request.getId(), roleName, user.getEmail(), request.getRequestedByEmail());

        return "Granted " + roleName + " to " + user.getEmail() + " (now holds "
                + user.getRoles().size() + " role(s)).";
    }

    private UUID parseTargetId(ApprovalRequest request) {
        try {
            return UUID.fromString(request.getTargetId());
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " targets '" + request.getTargetId()
                            + "', which is not a user id. A role grant needs the account's UUID.");
        }
    }
}
