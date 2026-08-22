package com.photonicomega.facilities.module.governance;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
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
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Proves that each gated action can actually be approved by the people who exist.
 *
 * <p>The approval gate is enforced entirely in terms of role names, and every part of
 * it can be correct while the whole thing is unusable. {@link SensitiveAction} says
 * BACKUP_RESTORE needs two approvals from SUPER_ADMIN or SECURITY_OFFICER; the gate
 * correctly refuses to let one person supply both, and correctly refuses to let the
 * requester approve their own request. If the only account in the database holding
 * either role is the one that raised the request, all three of those correct rules
 * combine into an action that no sequence of events can ever authorise.
 *
 * <p>That failure is invisible from every angle an ordinary test looks from. The
 * enum is right, the gate is right, the executor is right, and each has passing
 * tests. Nothing is wrong with the code at all - the deadlock lives in the gap
 * between the role names the catalogue references and the role names anybody has been
 * granted, and it surfaces only when a real administrator raises a real request and
 * discovers there is nobody who can sign it. By then they are already stuck, and the
 * action they wanted was the one for restoring a backup.
 *
 * <p>The arithmetic is the part worth being careful about, because "there is an
 * approver" is not the condition. An approver who is also the requester does not
 * count, so an action is only usable if it stays approvable in the worst case - when
 * the person asking is themselves one of the people who could have signed. Where the
 * requester and approver role sets overlap, one holder is therefore discounted before
 * the comparison.
 *
 * <p>This test does not assert that the seeded users are the right ones, only that
 * the gate is not decorative. If it fails, either grant the missing role to somebody
 * or lower the action's quorum - both are real answers, and the failure message says
 * which roles would fix it.
 */
@SpringBootTest
@ActiveProfiles("test")
class ApprovalQuorumReachableTest {

    @Autowired
    private UserRepository userRepository;

    @Test
    @DisplayName("every gated action has enough live approvers to reach its quorum")
    void everyActionCanBeApproved() {
        List<String> unreachable = new ArrayList<>();

        for (SensitiveAction action : SensitiveAction.values()) {
            Set<UUID> approvers = liveHoldersOfAny(action.getApproverRoles());
            Set<UUID> requesters = liveHoldersOfAny(action.getRequesterRoles());

            // A requester who also holds an approver role cannot sign their own
            // request, so in the worst case one approver is unavailable. Discount one
            // whenever the two populations overlap at all.
            boolean overlaps = approvers.stream().anyMatch(requesters::contains);
            int usable = overlaps ? approvers.size() - 1 : approvers.size();

            if (requesters.isEmpty()) {
                unreachable.add(action.name() + " - nobody can even request it. Requester roles: "
                        + String.join(", ", action.getRequesterRoles())
                        + "; live holders: none.");
                continue;
            }

            if (usable < action.getRequiredApprovals()) {
                unreachable.add(action.name() + " - needs " + action.getRequiredApprovals()
                        + " approval(s) from " + String.join(" or ", action.getApproverRoles())
                        + ", but only " + approvers.size() + " live account(s) hold any of those roles"
                        + (overlaps
                        ? " and at least one of them is also a permitted requester, leaving " + usable
                        : "")
                        + ". Requester roles: " + String.join(", ", action.getRequesterRoles())
                        + " (" + requesters.size() + " live holder(s)).");
            }
        }

        assertTrue(unreachable.isEmpty(),
                "These gated actions cannot be approved by anybody who currently exists, so "
                        + "requesting one produces a request that sits pending until it expires. "
                        + "The gate is not wrong - there is simply nobody holding the roles it "
                        + "requires. Grant the missing role to a real account, or reduce the "
                        + "action's quorum.\n\n  "
                        + String.join("\n  ", unreachable) + "\n");
    }

    @Test
    @DisplayName("no gated action relies on a role that no account anywhere holds")
    void everyReferencedRoleIsHeldBySomebody() {
        // The blunter version of the check above, reported separately because it has a
        // different fix. The test above says "this action is stuck"; this one says
        // "this role name is fiction", which is what makes it stuck - and a role name
        // in the catalogue that nobody holds is usually a typo or a role that was
        // renamed without the catalogue following.
        Set<String> referenced = new LinkedHashSet<>();
        for (SensitiveAction action : SensitiveAction.values()) {
            referenced.addAll(action.getRequesterRoles());
            referenced.addAll(action.getApproverRoles());
        }

        List<String> unheld = new ArrayList<>();
        for (String role : referenced) {
            if (liveHoldersOfAny(Set.of(role)).isEmpty()) {
                unheld.add(role);
            }
        }

        assertTrue(unheld.isEmpty(),
                "SensitiveAction references these roles, but no live account holds any of them. "
                        + "Every action that names one is either unrequestable or unapprovable: "
                        + String.join(", ", unheld) + "\n");
    }

    /**
     * The ids of live accounts holding at least one of {@code roleNames}.
     *
     * <p>Ids rather than counts, because the same person may hold two of the roles in
     * one action's set and must not be counted twice towards a quorum of two. Deleted
     * and non-ACTIVE accounts are excluded: a suspended approver cannot log in to
     * approve anything, so counting them would reproduce the exact false sense of
     * coverage this test exists to remove.
     */
    private Set<UUID> liveHoldersOfAny(Set<String> roleNames) {
        Set<UUID> ids = new LinkedHashSet<>();
        for (String role : roleNames) {
            for (User user : userRepository.findByRoleName(role)) {
                if (user.isAccountActive()) {
                    ids.add(user.getId());
                }
            }
        }
        return ids;
    }
}
