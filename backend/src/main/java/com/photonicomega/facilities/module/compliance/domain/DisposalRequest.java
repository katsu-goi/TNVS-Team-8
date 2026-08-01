package com.photonicomega.facilities.module.compliance.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A request to dispose of (permanently remove) an archived document. Created by
 * a compliance officer and decided (approved/rejected) by one. Kept as its own
 * entity so the reason, approver, and decision survive the document's deletion.
 */
@Entity
@Table(name = "disposal_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DisposalRequest extends BaseEntity {

    @Column(nullable = false)
    private UUID documentId;

    @Column(nullable = false)
    private String documentTitle;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DisposalStatus status;

    @Column(columnDefinition = "TEXT")
    private String decisionNotes;

    private String decidedBy;

    private LocalDateTime decidedAt;

    private String retentionPolicyName;
}
