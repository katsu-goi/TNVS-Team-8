package com.photonicomega.facilities.module.employee.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import com.photonicomega.facilities.module.auth.domain.User;
import jakarta.persistence.*;
import lombok.*;

/**
 * A per-user notification delivered to an employee ({@code recipient}) — e.g.
 * an approval/rejection alert or a reminder tied to one of their own records.
 * Carries real stored read/unread state.
 */
@Entity
@Table(name = "employee_notifications")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmployeeNotification extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_id", nullable = false)
    private User recipient;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private NotificationType type;

    @Column(name = "is_read", nullable = false)
    @Builder.Default
    private boolean read = false;

    private String relatedEntityType;

    private String relatedEntityId;
}
