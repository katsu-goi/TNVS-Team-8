package com.photonicomega.facilities.module.auth.dto;

import com.photonicomega.facilities.module.auth.domain.Role;

import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

public record RbacRoleDto(
        UUID id,
        String name,
        String displayName,
        String description,
        String dashboardKey,
        boolean systemRole,
        Set<String> directPermissions,
        Set<String> inheritedRoles
) {
    public static RbacRoleDto from(Role role) {
        return new RbacRoleDto(
                role.getId(),
                role.getName(),
                role.getDisplayName(),
                role.getDescription(),
                role.getDashboardKey(),
                role.isSystemRole(),
                role.getPermissions().stream()
                        .map(permission -> permission.getName())
                        .collect(Collectors.toSet()),
                role.getInheritedRoles().stream()
                        .map(Role::getName)
                        .collect(Collectors.toSet())
        );
    }
}
