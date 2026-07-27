package com.photonicomega.facilities.module.security.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "active_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ActiveSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String sessionId;

    @Column(nullable = false)
    private String userId;

    @Column(nullable = false)
    private String username;

    private String fullName;
    private String role;

    @Column(nullable = false, length = 45)
    private String ipAddress;

    private String browser;
    private String deviceName;
    private String country;

    @Column(nullable = false)
    private Instant loginTime;

    @Column(nullable = false)
    private Instant lastActivity;

    @Column(nullable = false)
    private String status; // ACTIVE, REVOKED, EXPIRED

    @PrePersist
    public void prePersist() {
        if (loginTime == null) loginTime = Instant.now();
        if (lastActivity == null) lastActivity = Instant.now();
        if (status == null) status = "ACTIVE";
    }
}
