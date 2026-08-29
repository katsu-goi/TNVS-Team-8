package com.photonicomega.facilities.module.auth.dto;

import java.util.List;
import java.util.Set;

public record RbacDashboardDto(
        String dashboardKey,
        Set<String> assignedRoles,
        Set<String> effectiveRoles,
        Set<String> permissions,
        List<RbacConflictDto> activeConstraints
) {
}
