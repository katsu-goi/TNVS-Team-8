package com.photonicomega.facilities.module.governance.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One approver's vote on one {@link ApprovalRequest}.
 *
 * <p>Votes are separate rows rather than a counter on the request, because a
 * counter cannot answer "who agreed to this", which is the only question that
 * matters when a disposal is later disputed.
 *
 * <p>The unique constraint on {@code (request_id, decided_by_id)} is load-bearing
 * security, not hygiene. Without it, the cheapest way to defeat a
 * two-signature requirement is for one approver to click approve twice: the
 * count reaches two, the request looks properly authorised, and the audit trail
 * shows one name listed twice - which nobody notices in a list view. The
 * database refuses the second row outright, so that attack cannot depend on
 * application code remembering to check.
 */
@Entity
@Table(name = "approval_decisions",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_approval_one_vote_per_approver",
                columnNames = {"request_id", "decided_by_id"}),
        indexes = @Index(name = "idx_decision_request", columnList = "request_id"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApprovalDecision extends BaseEntity {

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

    @Enumerated(EnumType.STRING)
    @Column(name = "decision", nullable = false, length = 16)
    private DecisionType decision;

    @Column(name = "decided_by_id", nullable = false)
    private UUID decidedById;

    @Column(name = "decided_by_email", nullable = false, length = 255)
    private String decidedByEmail;

    @Column(name = "decided_by_name", length = 255)
    private String decidedByName;

    /** The role the approver was acting under, captured at decision time. */
    @Column(name = "decided_by_role", length = 64)
    private String decidedByRole;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "decided_at", nullable = false)
    private LocalDateTime decidedAt;

    /** IP the vote was cast from, for the security review of a disputed approval. */
    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    /**
     * The AI's advisory verdict as it stood when this approver voted, so a later
     * reviewer can tell whether the approver was warned or not.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "ai_risk_at_decision", length = 16)
    private AiRiskLevel aiRiskAtDecision;
}
