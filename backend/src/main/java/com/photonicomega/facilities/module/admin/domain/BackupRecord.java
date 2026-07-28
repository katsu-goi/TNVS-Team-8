package com.photonicomega.facilities.module.admin.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "backup_records")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class BackupRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 20)
    private String backupType;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(nullable = false)
    private Instant startedAt;

    private Instant completedAt;

    private Long fileSize;

    @Column(length = 500)
    private String filePath;

    @Column(length = 20)
    private String integrityCheck;

    private String triggeredBy;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
