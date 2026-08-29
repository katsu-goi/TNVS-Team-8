package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.exception.ResourceAlreadyExistsException;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.admin.dto.UserDTO;
import com.photonicomega.facilities.module.auth.domain.Permission;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.RoleConflict;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.dto.CreateRoleConflictRequest;
import com.photonicomega.facilities.module.auth.dto.RbacConflictDto;
import com.photonicomega.facilities.module.auth.dto.RbacPermissionDto;
import com.photonicomega.facilities.module.auth.dto.RbacRoleDto;
import com.photonicomega.facilities.module.auth.repository.PermissionRepository;
import com.photonicomega.facilities.module.auth.repository.RefreshTokenRepository;
import com.photonicomega.facilities.module.auth.repository.RoleConflictRepository;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RbacAdministrationService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final RoleConflictRepository roleConflictRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final RoleHierarchyService roleHierarchyService;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public List<RbacRoleDto> listRoles() {
        return roleRepository.findAllByDeletedFalseOrderByNameAsc().stream()
                .map(RbacRoleDto::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<UserDTO> listUsers() {
        return userRepository.findAllByDeletedFalseOrderByEmailAsc().stream()
                .map(UserDTO::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RbacPermissionDto> listPermissions() {
        return permissionRepository.findAllByDeletedFalseOrderByNameAsc().stream()
                .map(RbacPermissionDto::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RbacConflictDto> listConflicts() {
        return roleConflictRepository.findAllByDeletedFalseOrderByCodeAsc().stream()
                .map(RbacConflictDto::from)
                .toList();
    }

    @Transactional
    public void assignRole(UUID userId, UUID roleId, String actorEmail) {
        User target = requireUser(userId);
        Role role = requireRole(roleId);
        if (target.getRoles().stream().anyMatch(existing -> existing.getId().equals(roleId))) return;

        Set<Role> proposed = new HashSet<>(target.getRoles());
        proposed.add(role);
        roleHierarchyService.assertNoConflicts(proposed);

        String before = roleNames(target.getRoles());
        target.getRoles().add(role);
        userRepository.save(target);
        refreshTokenRepository.revokeAllUserTokens(target.getId());
        audit(actorEmail, "RBAC_ROLE_ASSIGNED", "User", target.getId().toString(),
                "Assigned " + role.getName() + " to " + target.getEmail(), before, roleNames(target.getRoles()));
    }

    @Transactional
    public void revokeRole(UUID userId, UUID roleId, String actorEmail) {
        User target = requireUser(userId);
        Role role = requireRole(roleId);
        boolean assigned = target.getRoles().stream()
                .anyMatch(existing -> existing.getId().equals(roleId));
        if (!assigned) return;
        if (target.getRoles().size() <= 1) {
            throw new BusinessRuleViolationException(
                    "An active user must retain at least one assigned role.");
        }
        if ("SUPER_ADMIN".equals(role.getName())) {
            long superAdminCount = userRepository.findAllByDeletedFalseOrderByEmailAsc().stream()
                    .filter(user -> user.getRoles().stream()
                            .anyMatch(candidateRole -> "SUPER_ADMIN".equals(candidateRole.getName())))
                    .count();
            if (superAdminCount <= 1) {
                throw new BusinessRuleViolationException(
                        "The last super administrator role cannot be revoked.");
            }
        }
        String before = roleNames(target.getRoles());
        boolean removed = target.getRoles().removeIf(candidateRole -> candidateRole.getId().equals(roleId));
        if (!removed) return;
        userRepository.save(target);
        refreshTokenRepository.revokeAllUserTokens(target.getId());
        audit(actorEmail, "RBAC_ROLE_REVOKED", "User", target.getId().toString(),
                "Revoked a role from " + target.getEmail(), before, roleNames(target.getRoles()));
    }

    @Transactional
    public void grantPermission(UUID roleId, UUID permissionId, String actorEmail) {
        Role role = requireRole(roleId);
        Permission permission = permissionRepository.findById(permissionId)
                .filter(existing -> !existing.isDeleted())
                .orElseThrow(() -> new ResourceNotFoundException("Permission", "id", permissionId));
        if (!role.getPermissions().add(permission)) return;
        roleRepository.save(role);
        revokeUsersAffectedBy(role);
        audit(actorEmail, "RBAC_PERMISSION_GRANTED", "Role", roleId.toString(),
                "Granted " + permission.getName() + " to " + role.getName(), null, null);
    }

    @Transactional
    public void revokePermission(UUID roleId, UUID permissionId, String actorEmail) {
        Role role = requireRole(roleId);
        boolean removed = role.getPermissions().removeIf(permission -> permission.getId().equals(permissionId));
        if (!removed) return;
        roleRepository.save(role);
        revokeUsersAffectedBy(role);
        audit(actorEmail, "RBAC_PERMISSION_REVOKED", "Role", roleId.toString(),
                "Revoked a permission from " + role.getName(), null, null);
    }

    @Transactional
    public void addInheritance(UUID seniorRoleId, UUID juniorRoleId, String actorEmail) {
        Role senior = requireRole(seniorRoleId);
        Role junior = requireRole(juniorRoleId);
        if (senior.getInheritedRoles().stream().anyMatch(role -> role.getId().equals(juniorRoleId))) return;
        roleHierarchyService.assertInheritanceDoesNotCycle(senior, junior);

        senior.getInheritedRoles().add(junior);
        roleRepository.save(senior);
        assertAllUsersRespectConstraints();
        revokeUsersAffectedBy(senior);
        audit(actorEmail, "RBAC_HIERARCHY_ADDED", "Role", seniorRoleId.toString(),
                senior.getName() + " now inherits " + junior.getName(), null, null);
    }

    @Transactional
    public void removeInheritance(UUID seniorRoleId, UUID juniorRoleId, String actorEmail) {
        Role senior = requireRole(seniorRoleId);
        boolean removed = senior.getInheritedRoles().removeIf(role -> role.getId().equals(juniorRoleId));
        if (!removed) return;
        roleRepository.save(senior);
        revokeUsersAffectedBy(senior);
        audit(actorEmail, "RBAC_HIERARCHY_REMOVED", "Role", seniorRoleId.toString(),
                "Removed inherited role from " + senior.getName(), null, null);
    }

    @Transactional
    public RbacConflictDto createConflict(CreateRoleConflictRequest request, String actorEmail) {
        if (request.firstRoleId().equals(request.secondRoleId())) {
            throw new BusinessRuleViolationException("A role cannot conflict with itself.");
        }
        roleConflictRepository.findByCodeAndDeletedFalse(request.code().trim().toUpperCase())
                .ifPresent(existing -> {
                    throw new ResourceAlreadyExistsException("Role conflict code already exists: " + existing.getCode());
                });

        Role first = requireRole(request.firstRoleId());
        Role second = requireRole(request.secondRoleId());
        if (roleConflictRepository.existsByUnorderedRolePair(first.getId(), second.getId())) {
            throw new ResourceAlreadyExistsException(
                    "A Separation of Duties constraint already exists for these roles.");
        }
        assertNoExistingUserHasBoth(first, second);

        RoleConflict saved = roleConflictRepository.save(RoleConflict.builder()
                .firstRole(first)
                .secondRole(second)
                .code(request.code().trim().toUpperCase())
                .description(request.description())
                .active(true)
                .build());
        audit(actorEmail, "RBAC_CONSTRAINT_CREATED", "RoleConflict", saved.getId().toString(),
                "Created SoD constraint " + saved.getCode(), null, null);
        return RbacConflictDto.from(saved);
    }

    @Transactional
    public void deactivateConflict(UUID conflictId, String actorEmail) {
        RoleConflict conflict = roleConflictRepository.findById(conflictId)
                .filter(existing -> !existing.isDeleted())
                .orElseThrow(() -> new ResourceNotFoundException("RoleConflict", "id", conflictId));
        conflict.setActive(false);
        roleConflictRepository.save(conflict);
        audit(actorEmail, "RBAC_CONSTRAINT_DEACTIVATED", "RoleConflict", conflictId.toString(),
                "Deactivated SoD constraint " + conflict.getCode(), null, null);
    }

    private User requireUser(UUID userId) {
        return userRepository.findById(userId)
                .filter(user -> !user.isDeleted())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
    }

    private Role requireRole(UUID roleId) {
        return roleRepository.findById(roleId)
                .filter(role -> !role.isDeleted())
                .orElseThrow(() -> new ResourceNotFoundException("Role", "id", roleId));
    }

    private void assertAllUsersRespectConstraints() {
        userRepository.findAllByDeletedFalseOrderByEmailAsc()
                .forEach(user -> roleHierarchyService.assertNoConflicts(user.getRoles()));
    }

    private void assertNoExistingUserHasBoth(Role first, Role second) {
        for (User user : userRepository.findAllByDeletedFalseOrderByEmailAsc()) {
            Set<String> names = roleHierarchyService.resolveEffectiveRoles(user.getRoles()).stream()
                    .map(Role::getName)
                    .collect(Collectors.toSet());
            if (names.contains(first.getName()) && names.contains(second.getName())) {
                throw new BusinessRuleViolationException(
                        "Cannot add this SoD constraint because " + user.getEmail()
                                + " currently has both roles.");
            }
        }
    }

    private void revokeUsersAffectedBy(Role changedRole) {
        userRepository.findAllByDeletedFalseOrderByEmailAsc().stream()
                .filter(user -> roleHierarchyService.resolveEffectiveRoles(user.getRoles()).stream()
                        .anyMatch(role -> role.getName().equals(changedRole.getName())))
                .forEach(user -> refreshTokenRepository.revokeAllUserTokens(user.getId()));
    }

    private String roleNames(Set<Role> roles) {
        return roles.stream().map(Role::getName).sorted().collect(Collectors.joining(","));
    }

    private void audit(
            String actorEmail,
            String action,
            String entityType,
            String entityId,
            String description,
            String oldValues,
            String newValues
    ) {
        User actor = actorEmail == null ? null
                : userRepository.findByEmailAndDeletedFalse(actorEmail).orElse(null);
        auditService.logWithValues(actor, action, "RBAC", entityType, entityId,
                description, oldValues, newValues, null);
    }
}
