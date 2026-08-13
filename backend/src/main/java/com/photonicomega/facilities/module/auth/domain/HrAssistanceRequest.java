package com.photonicomega.facilities.module.auth.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "hr_assistance_requests", indexes = {
        @Index(name = "idx_hr_assistance_status", columnList = "status"),
        @Index(name = "idx_hr_assistance_email", columnList = "requester_email"),
        @Index(name = "idx_hr_assistance_created_at", columnList = "created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HrAssistanceRequest extends BaseEntity {

    @Column(name = "requester_name", nullable = false, length = 200)
    private String requesterName;

    @Column(name = "requester_email", nullable = false, length = 255)
    private String requesterEmail;

    @Column(name = "subject", nullable = false, length = 300)
    private String subject;

    @Column(name = "message", nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "priority", length = 20)
    @Builder.Default
    private String priority = "NORMAL";

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "user_agent", length = 500)
    private String userAgent;
}
