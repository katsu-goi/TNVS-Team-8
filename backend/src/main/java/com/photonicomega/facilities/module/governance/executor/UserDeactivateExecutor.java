package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Carries out an authorised deactivation of a user account, moving it to
 * {@link UserStatus#INACTIVE} so the login path refuses it.
 *
 * <p>Distinct from {@link UserRoleRevokeExecutor}, the other gated act that takes
 * capability away from a person. A revoke removes one piece of authority and
 * leaves the account working; this closes the account and leaves the authority
 * recorded against it. The difference matters after the fact: reactivating
 * restores exactly the roles the person held, whereas a revoked role only comes
 * back through a fresh {@link SensitiveAction#USER_ROLE_GRANT}. Collapsing the two
 * would make "we locked this account during an incident" and "we took this
 * person's approval authority away" indistinguishable in every later report, and
 * they are answers to different questions.
 *
 * <p>The roles are therefore left exactly as they are. Stripping them here would
 * quietly convert a reversible lockout into an irreversible loss of authority,
 * and it would do it without the second signature that removing a role requires
 * in its own right.
 *
 * <p>Deactivation, not deletion. The enum's rationale for gating this act is that
 * a wrong lockout is an availability incident, so the act chosen is the one that
 * can be undone by an administrator flipping the status back - the soft-delete
 * flag is left alone, because destroying the account is not what the approvers
 * were shown.
 *
 * <p>The status flip is sufficient to end the person's access, but only because
 * {@code AuthService.refreshToken} re-checks {@code isAccountActive()} on every
 * renewal and revokes the presented token when it fails. That check was added
 * alongside this executor and is what makes the deactivation real: without it, the
 * refresh endpoint would go on issuing fresh access tokens and rotated refresh
 * tokens to a deactivated account indefinitely, so the console would read INACTIVE
 * while the person carried on working, and this approval would have bought nothing.
 * See {@code DeactivatedAccountTokenTest}. Do not remove that check on the grounds
 * that login already validates status - login is not the path that matters here.
 *
 * <p>What remains is bounded and deliberate. An access token already issued stays
 * valid until it expires, because it is a stateless JWT that no server-side change
 * can recall - so there is a window of at most its 15-minute lifetime. The
 * {@code active_sessions} row also stays, which is why the security console still
 * lists the person as signed in: clearing it is
 * {@link SensitiveAction#SESSION_REVOKE}, a separate act on a separate object, and
 * an executor that quietly performed a second gated action would be doing something
 * the approvers were not shown. The returned outcome says so rather than leaving an
 * approver to assume the person was thrown out mid-session.
 *
 * <p>The login-lockout fields ({@code lockedUntil}, {@code failedLoginAttempts}) are
 * untouched: that is the brute-force counter, cleared by the admin unlock endpoint,
 * and overwriting it here would either forgive a lockout in progress or invent one.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class UserDeactivateExecutor implements SensitiveActionExecutor {

    private final UserRepository userRepository;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.USER_DEACTIVATE;
    }

    @Override
    public String execute(ApprovalRequest request) {
        UUID userId = UUID.fromString(request.getTargetId());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "User " + userId + " no longer exists, so the approved deactivation "
                                + "cannot be carried out."));

        if (user.getStatus() == UserStatus.INACTIVE) {
            // Idempotent rather than an error: the state the approvers authorised
            // - this account unable to sign in - is already the state of the
            // record, so re-running changes nothing and reports what it found.
            return "Account '" + user.getEmail() + "' was already " + UserStatus.INACTIVE
                    + ", so nothing was changed"
                    + (user.isDeleted() ? "; the account was also deleted on " + user.getDeletedAt()
                            + " by " + user.getDeletedBy() + "." : ".");
        }

        // Captured before the write. SUSPENDED and PENDING_VERIFICATION both also
        // block login, so an approver reading the audit trail needs to see what
        // the account's standing actually was to judge whether this act changed
        // anything the person could feel.
        UserStatus previous = user.getStatus();

        user.setStatus(UserStatus.INACTIVE);
        userRepository.save(user);

        log.info("User {} ({}) deactivated: status {} -> {} under approval {} (requested by {}); "
                        + "roles retained, active_sessions row untouched, refresh now refused",
                userId, user.getEmail(), previous, UserStatus.INACTIVE, request.getId(),
                request.getRequestedByEmail());

        return "Account '" + user.getEmail() + "' (" + user.getFullName() + ") moved from " + previous
                + " to " + UserStatus.INACTIVE + " under approval " + request.getId()
                + ". Roles retained: " + describeRoles(user)
                + " - reactivation restores exactly that authority, and removing any of it needs its "
                + "own approval. New logins are refused from now on, and so is token renewal: the "
                + "next refresh attempt is rejected and the refresh token revoked with it. An access "
                + "token already issued stays valid until it expires (at most 15 minutes), and the "
                + "security console will still list an open session until "
                + SensitiveAction.SESSION_REVOKE.name()
                + " is requested for it - ask for that too if the lockout has to bite this second.";
    }

    /**
     * The authority this account keeps while it is closed.
     *
     * <p>Named in the outcome, not just counted, because the one thing an approver
     * cannot reconstruct later is whether closing this account has just taken the
     * last holder of an approver role out of circulation. Sorted so two readings of
     * the same audit entry list the roles in the same order - {@code User.roles} is
     * a {@code HashSet}, whose iteration order is not something to publish into a
     * permanent record.
     */
    private static String describeRoles(User user) {
        if (user.getRoles() == null || user.getRoles().isEmpty()) {
            return "none";
        }
        return user.getRoles().stream()
                .map(Role::getName)
                .filter(name -> name != null && !name.isBlank())
                .sorted()
                .collect(Collectors.joining(", "));
    }
}
