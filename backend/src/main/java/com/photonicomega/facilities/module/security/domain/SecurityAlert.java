package com.photonicomega.facilities.module.security.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "security_alerts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SecurityAlert {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RiskLevel severity;

    @Column(nullable = false)
    private String alertType;

    private String targetIp;
    private String targetUserId;

    @Column(nullable = false)
    private String status; // UNRESOLVED, INVESTIGATING, RESOLVED

    private String resolvedBy;
    private Instant resolvedAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (status == null) status = "UNRESOLVED";
    }
}
