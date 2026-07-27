package com.photonicomega.security.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "security_alerts", indexes = {
        @Index(name = "idx_sec_alerts_severity", columnList = "severity"),
        @Index(name = "idx_sec_alerts_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
public class SecurityAlert {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "alert_type", nullable = false)
    private String alertType;

    @Column(name = "severity", nullable = false)
    private String severity;

    private String module;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "timestamp", nullable = false)
    private OffsetDateTime timestamp = OffsetDateTime.now();

    @Column(name = "status", nullable = false)
    private String status = "OPEN";

    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "user_id")
    private UUID userId;
}
