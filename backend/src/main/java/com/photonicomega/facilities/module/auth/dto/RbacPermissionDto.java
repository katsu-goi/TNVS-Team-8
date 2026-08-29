package com.photonicomega.facilities.module.auth.dto;

import com.photonicomega.facilities.module.auth.domain.Permission;

import java.util.UUID;

public record RbacPermissionDto(
        UUID id,
        String name,
        String displayName,
        String description,
        String module,
        String resource,
        String action
) {
    public static RbacPermissionDto from(Permission permission) {
        return new RbacPermissionDto(
                permission.getId(),
                permission.getName(),
                permission.getDisplayName(),
                permission.getDescription(),
                permission.getModule(),
                permission.getResource(),
                permission.getAction().name()
        );
    }
}
