package com.photonicomega.facilities.module.auth.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "users", indexes = {
        @Index(name = "idx_users_email", columnList = "email", unique = true),
        @Index(name = "idx_users_employee_id", columnList = "employee_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User extends BaseEntity {

    @Column(name = "employee_id", unique = true, length = 50)
    private String employeeId;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    @Column(name = "email", nullable = false, unique = true, length = 255)
    private String email;

    // WRITE_ONLY: never serialised into a response, but still accepted when
    // binding inbound JSON. Any endpoint that returns an entity referencing a
    // User would otherwise expose the bcrypt hash.
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "phone_number", length = 20)
    private String phoneNumber;

    @Column(name = "department", length = 100)
    private String department;

    @Column(name = "position", length = 100)
    private String position;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private UserStatus status = UserStatus.ACTIVE;

    @Column(name = "is_email_verified", nullable = false)
    @Builder.Default
    private boolean emailVerified = false;

    @Column(name = "email_verified_at")
    private LocalDateTime emailVerifiedAt;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "last_login_ip", length = 45)
    private String lastLoginIp;

    @Column(name = "failed_login_attempts", nullable = false)
    @Builder.Default
    private int failedLoginAttempts = 0;

    @Column(name = "last_failed_attempt_at")
    private LocalDateTime lastFailedAttemptAt;

    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Column(name = "password_reset_token")
    private String passwordResetToken;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Column(name = "password_reset_expires_at")
    private LocalDateTime passwordResetExpiresAt;

    @ManyToMany(fetch = FetchType.EAGER, cascade = {CascadeType.MERGE, CascadeType.PERSIST})
    @JoinTable(
            name = "user_roles",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    @Builder.Default
    private Set<Role> roles = new HashSet<>();

    public String getFullName() {
        return firstName + " " + lastName;
    }

    public boolean isAccountLocked() {
        return lockedUntil != null && LocalDateTime.now().isBefore(lockedUntil);
    }

    public boolean isAccountActive() {
        return status == UserStatus.ACTIVE && !isDeleted();
    }

    public void incrementFailedAttempts() {
        this.failedLoginAttempts++;
    }

    public void resetFailedAttempts() {
        this.failedLoginAttempts = 0;
        this.lockedUntil = null;
        this.lastFailedAttemptAt = null;
    }

    public void lockAccount(int durationMinutes) {
        this.lockedUntil = LocalDateTime.now().plusMinutes(durationMinutes);
    }

    public void lockAccountSeconds(long durationSeconds) {
        this.lockedUntil = LocalDateTime.now().plusSeconds(durationSeconds);
    }

    public void lockAccountPermanently(long durationDays) {
        this.lockedUntil = LocalDateTime.now().plusDays(durationDays);
    }

    public long remainingLockSeconds() {
        if (lockedUntil == null) {
            return 0;
        }
        return Math.max(0, java.time.Duration.between(LocalDateTime.now(), lockedUntil).getSeconds());
    }
}
