package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.module.auth.domain.Permission;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.dto.RbacConflictDto;
import com.photonicomega.facilities.module.auth.dto.RbacDashboardDto;
import com.photonicomega.facilities.module.auth.dto.UserSummaryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RbacProfileService {

    private final RoleHierarchyService roleHierarchyService;

    public UserSummaryDto summarize(User user) {
        Set<Role> effectiveRoles = roleHierarchyService.resolveEffectiveRoles(user.getRoles());
        Set<Permission> effectivePermissions = roleHierarchyService.resolveEffectivePermissions(user.getRoles());
        return UserSummaryDto.from(
                user,
                effectiveRoles,
                effectivePermissions,
                roleHierarchyService.resolveDashboardKey(user.getRoles())
        );
    }

    public RbacDashboardDto dashboard(User user) {
        Set<Role> effectiveRoles = roleHierarchyService.resolveEffectiveRoles(user.getRoles());
        Set<Permission> effectivePermissions = roleHierarchyService.resolveEffectivePermissions(user.getRoles());
        return new RbacDashboardDto(
                roleHierarchyService.resolveDashboardKey(user.getRoles()),
                user.getRoles().stream().map(Role::getName).collect(Collectors.toSet()),
                effectiveRoles.stream().map(Role::getName).collect(Collectors.toSet()),
                effectivePermissions.stream().map(Permission::getName).collect(Collectors.toSet()),
                roleHierarchyService.findRelevantConstraints(user.getRoles()).stream()
                        .map(RbacConflictDto::from)
                        .toList()
        );
    }
}
