package com.photonicomega.facilities.config;

import com.photonicomega.facilities.module.auth.domain.Permission;
import com.photonicomega.facilities.module.auth.domain.PermissionAction;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

/**
 * Attaches a shared role to a newly seeded user, in one transaction.
 *
 * <p>Exists because a role held by more than one account cannot be seeded correctly
 * without a transaction, and {@link BootstrapAdmin} cannot open one on itself. Two
 * ways of doing it without this class both abort application startup:
 *
 * <ol>
 *   <li><b>Build a fresh {@code Role} per holder.</b> {@code roles.name} is unique,
 *       so the second holder's insert violates the constraint. The exception leaves
 *       {@link org.springframework.boot.CommandLineRunner#run}, which aborts the
 *       whole application.</li>
 *   <li><b>Look the role up instead, outside a transaction.</b>
 *       {@code roleRepository.findByName} runs in a transaction of its own, so the
 *       instance it returns is <em>detached</em> - persistent, with an id, and
 *       attached to nothing. Saving a brand-new {@code User} calls {@code persist},
 *       {@code user.roles} cascades PERSIST, and persisting a detached instance
 *       throws {@code PersistentObjectException: detached entity passed to
 *       persist}. Also out of {@code run()}, also fatal.</li>
 * </ol>
 *
 * <p>Inside a transaction the lookup returns a <em>managed</em> Role instead, and
 * cascading PERSIST onto an already-persistent instance is defined to do nothing. So
 * the fix is not a different call - it is the same calls with a persistence context
 * around them.
 *
 * <p>It is a separate bean rather than a {@code @Transactional} method on
 * {@link BootstrapAdmin} for the reason {@code RefreshTokenRevoker} and
 * {@code ApprovalStateWriter} are: Spring applies transaction advice through a proxy,
 * and {@code seedApprover} is reached by self-invocation from {@code run()}. The
 * annotation would be accepted, ignored, and the code would fail exactly as it does
 * without it - the worst kind of fix, one that looks applied and is not.
 *
 * <p>Each call commits before returning, which is what lets the <em>next</em> holder
 * of the same role find it. Two calls inside one outer transaction would both miss
 * and both create.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SeededRoleBinder {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;

    /**
     * Saves {@code user} holding {@code roleName}, creating that role only if no
     * account already holds it.
     *
     * <p>{@code user} is expected to arrive with no roles set; the role is added here
     * rather than passed through the builder so the resolved instance is the managed
     * one. The display name and description are used only when the role is created,
     * and ignored when it already exists - the first seeder to need a role defines it,
     * and later ones do not get to redefine it behind the first one's back.
     */
    @Transactional
    public User saveWithRole(User user, String roleName, String roleDisplay,
                             String roleDescription) {
        Role role = roleRepository.findByName(roleName)
                .orElseGet(() -> {
                    log.info("Creating governance role {}...", roleName);
                    return roleRepository.save(buildRole(roleName, roleDisplay, roleDescription));
                });

        user.getRoles().add(role);
        return userRepository.save(user);
    }

    /**
     * A new governance role and the permission it carries.
     *
     * <p>The {@code Permission} is left transient deliberately: {@code role.permissions}
     * cascades PERSIST, and the role is saved inside the caller's transaction, so the
     * permission is inserted with it. Saving it separately here would be a second
     * insert of the same row.
     */
    private Role buildRole(String roleName, String roleDisplay, String roleDescription) {
        Permission permission = Permission.builder()
                .name(roleName + "_APPROVALS")
                .displayName(roleDisplay + " Approvals")
                .description("Authority over gated, irreversible actions as " + roleDisplay + ".")
                .module("GOVERNANCE")
                .resource("*")
                .action(PermissionAction.MANAGE)
                .build();

        return Role.builder()
                .name(roleName)
                .displayName(roleDisplay)
                .description(roleDescription)
                .systemRole(true)
                .permissions(Set.of(permission))
                .build();
    }
}
