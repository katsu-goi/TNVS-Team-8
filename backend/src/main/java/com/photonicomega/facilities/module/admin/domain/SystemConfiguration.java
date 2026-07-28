package com.photonicomega.facilities.module.admin.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "system_configurations")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class SystemConfiguration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 100)
    private String configKey;

    @Column(columnDefinition = "TEXT")
    private String configValue;

    @Column(length = 255)
    private String description;

    @Column(length = 50)
    private String category;

    @Column(nullable = false)
    private Instant updatedAt;

    private String updatedBy;
}
