package com.photonicomega.facilities.module.admin.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "integration_status")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class IntegrationStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 100)
    private String systemName;

    @Column(nullable = false, length = 20)
    private String connectionStatus;

    private Instant lastSyncAt;

    @Column(length = 20)
    private String apiHealth;

    private Long responseTimeMs;

    private int failedSyncs;

    private Instant lastSuccessfulConnection;
}
