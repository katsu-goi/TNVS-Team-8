package com.photonicomega.facilities.module.auth.dto;

import com.photonicomega.facilities.module.auth.domain.RoleConflict;

import java.util.UUID;

public record RbacConflictDto(
        UUID id,
        String code,
        String description,
        String firstRole,
        String secondRole,
        boolean active
) {
    public static RbacConflictDto from(RoleConflict conflict) {
        return new RbacConflictDto(
                conflict.getId(),
                conflict.getCode(),
                conflict.getDescription(),
                conflict.getFirstRole().getName(),
                conflict.getSecondRole().getName(),
                conflict.isActive()
        );
    }
}
