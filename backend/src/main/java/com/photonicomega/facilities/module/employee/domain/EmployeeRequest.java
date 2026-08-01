package com.photonicomega.facilities.module.employee.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import com.photonicomega.facilities.module.auth.domain.User;
import jakarta.persistence.*;
import lombok.*;

/**
 * A self-service contract or legal request submitted by an employee. Owned by
 * the submitting {@link User} ({@code requester}); the employee can track its
 * status and cancel it while still pending/under review.
 */
@Entity
@Table(name = "employee_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmployeeRequest extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requester_id", nullable = false)
    private User requester;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RequestType type;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RequestStatus status;

    @Column(columnDefinition = "TEXT")
    private String decisionNotes;
}
