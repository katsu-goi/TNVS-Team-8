package com.photonicomega.facilities.module.auth.dto;

import com.photonicomega.facilities.module.auth.domain.Permission;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserSummaryDto {
    private UUID id;
    private String firstName;
    private String lastName;
    private String fullName;
    private String email;
    private String employeeId;
    private String department;
    private String position;
    private String avatarUrl;
    private Set<String> roles;
    private Set<String> assignedRoles;
    private Set<String> permissions;
    private String dashboardKey;

    public static UserSummaryDto from(User user) {
        return from(user, user.getRoles(), user.getRoles().stream()
                .flatMap(role -> role.getPermissions().stream())
                .collect(Collectors.toSet()), null);
    }

    public static UserSummaryDto from(
            User user,
            Set<Role> effectiveRoles,
            Set<Permission> effectivePermissions,
            String dashboardKey
    ) {
        return UserSummaryDto.builder()
                .id(user.getId())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .employeeId(user.getEmployeeId())
                .department(user.getDepartment())
                .position(user.getPosition())
                .avatarUrl(user.getAvatarUrl())
                .roles(effectiveRoles.stream()
                        .map(Role::getName)
                        .collect(Collectors.toSet()))
                .assignedRoles(user.getRoles().stream()
                        .map(Role::getName)
                        .collect(Collectors.toSet()))
                .permissions(effectivePermissions.stream()
                        .map(Permission::getName)
                        .collect(Collectors.toSet()))
                .dashboardKey(dashboardKey)
                .build();
    }
}
