package com.photonicomega.facilities.module.security.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "security_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SecurityLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private Instant timestamp;

    private String userId;
    private String username;
    private String fullName;
    private String role;
    private String department;

    @Column(nullable = false, length = 45)
    private String ipAddress;

    private String deviceName;
    private String browser;
    private String operatingSystem;
    private String sessionId;
    private String requestId;
    private String apiEndpoint;
    private String httpMethod;

    @Column(nullable = false)
    private String action;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SecurityModule module;

    private String affectedRecord;

    @Column(columnDefinition = "TEXT")
    private String previousValue;

    @Column(columnDefinition = "TEXT")
    private String newValue;

    @Column(nullable = false)
    private String status;

    @Column(columnDefinition = "TEXT")
    private String reason;

    private String geoLocation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RiskLevel riskLevel;

    @PrePersist
    public void prePersist() {
        if (timestamp == null) {
            timestamp = Instant.now();
        }
    }
}
