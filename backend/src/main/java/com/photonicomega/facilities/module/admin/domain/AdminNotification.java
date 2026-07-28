package com.photonicomega.facilities.module.admin.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "admin_notifications")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class AdminNotification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Column(nullable = false, length = 30)
    private String type;

    @Column(nullable = false, length = 20)
    private String severity;

    private boolean read;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant expiresAt;
}
