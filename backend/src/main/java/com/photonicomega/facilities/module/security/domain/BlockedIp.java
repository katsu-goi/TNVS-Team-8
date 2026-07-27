package com.photonicomega.facilities.module.security.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "blocked_ips")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BlockedIp {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 45)
    private String ipAddress;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(nullable = false)
    private String blockedBy;

    @Column(nullable = false)
    private Instant blockedAt;

    private Instant expiresAt;

    @Column(nullable = false)
    private String status; // ACTIVE, EXPIRED, UNBLOCKED

    private Long attemptsCount;

    @PrePersist
    public void prePersist() {
        if (blockedAt == null) {
            blockedAt = Instant.now();
        }
        if (status == null) {
            status = "ACTIVE";
        }
    }
}
