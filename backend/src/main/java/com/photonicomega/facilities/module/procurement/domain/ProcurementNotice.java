package com.photonicomega.facilities.module.procurement.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "procurement_notices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProcurementNotice extends BaseEntity {

    @Enumerated(EnumType.STRING)
    private NoticeType type;

    @Enumerated(EnumType.STRING)
    private NoticeSeverity severity;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String message;

    private String entityType;
    private String entityId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private NoticeStatus status;

    @Column(unique = true)
    private String dedupKey;

    private String acknowledgedBy;
    private LocalDateTime acknowledgedAt;
}
