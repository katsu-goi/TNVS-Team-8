package com.photonicomega.facilities.module.admin.domain;

import com.photonicomega.facilities.module.auth.domain.User;
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

    /**
     * The administrator this notification is addressed to. Nullable so a
     * notification may be a global announcement, but system alerts created by
     * {@code AdminNotificationService} always target a specific SUPER_ADMIN so
     * read state is per-admin.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User recipient;

    private String relatedEntityType;

    private String relatedEntityId;

    private boolean read;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant expiresAt;
}
