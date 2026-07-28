package com.photonicomega.facilities.module.admin.dto;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Getter
@Builder
@AllArgsConstructor
public class UserDTO {
    private UUID id;
    private String employeeId;
    private String firstName;
    private String lastName;
    private String fullName;
    private String email;
    private String phoneNumber;
    private String department;
    private String position;
    private String avatarUrl;
    private UserStatus status;
    private boolean emailVerified;
    private LocalDateTime lastLoginAt;
    private String lastLoginIp;
    private boolean accountLocked;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Set<String> roles;

    public static UserDTO from(User user) {
        return UserDTO.builder()
                .id(user.getId())
                .employeeId(user.getEmployeeId())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .phoneNumber(user.getPhoneNumber())
                .department(user.getDepartment())
                .position(user.getPosition())
                .avatarUrl(user.getAvatarUrl())
                .status(user.getStatus())
                .emailVerified(user.isEmailVerified())
                .lastLoginAt(user.getLastLoginAt())
                .lastLoginIp(user.getLastLoginIp())
                .accountLocked(user.isAccountLocked())
                .createdAt(user.getCreatedAt())
                .updatedAt(user.getUpdatedAt())
                .roles(user.getRoles().stream().map(r -> r.getName()).collect(Collectors.toSet()))
                .build();
    }
}
