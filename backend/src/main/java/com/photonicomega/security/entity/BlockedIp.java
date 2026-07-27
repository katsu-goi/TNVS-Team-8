package com.photonicomega.security.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "blocked_ips", indexes = {
        @Index(name = "idx_blocked_ips_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
public class BlockedIp {
    @Id
    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "reason", nullable = false)
    private String reason;

    @Column(name = "blocked_by")
    private UUID blockedBy;

    @Column(name = "blocked_at", nullable = false)
    private OffsetDateTime blockedAt = OffsetDateTime.now();

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Column(name = "status", nullable = false)
    private String status = "BLOCKED";
}
