package com.photonicomega.facilities.module.auth.dto;

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
    private Set<String> permissions;

    public static UserSummaryDto from(User user) {
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
                .roles(user.getRoles().stream()
                        .map(r -> r.getName())
                        .collect(Collectors.toSet()))
                .permissions(user.getRoles().stream()
                        .flatMap(r -> r.getPermissions().stream())
                        .map(p -> p.getName())
                        .collect(Collectors.toSet()))
                .build();
    }
}
