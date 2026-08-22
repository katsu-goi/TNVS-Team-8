package com.photonicomega.facilities.module.governance.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A recorded intent to perform an irreversible act, and the authority for it.
 *
 * <p>This entity is the reason destructive endpoints stopped mutating. A caller
 * asking to delete a document no longer deletes anything - it creates one of
 * these, in {@link ApprovalStatus#PENDING}. The mutation happens later, once,
 * inside the gate, and only after enough <em>distinct</em> people have agreed.
 *
 * <p>The requester is stored as an explicit {@code requestedById} rather than
 * relying on the inherited {@code createdBy} audit string. Identity comparison
 * for the four-eyes rule has to be on a stable user id: e-mail addresses are
 * mutable, can be re-pointed to a different person, and can differ in case.
 * The existing disposal flow compared nothing at all, which is how a single
 * officer could request and approve the same disposal seconds apart.
 */
@Entity
@Table(name = "approval_requests", indexes = {
        @Index(name = "idx_approval_status", columnList = "status"),
        @Index(name = "idx_approval_action", columnList = "action"),
        @Index(name = "idx_approval_target", columnList = "target_type,target_id"),
        @Index(name = "idx_approval_requester", columnList = "requested_by_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApprovalRequest extends BaseEntity {

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, length = 64)
    private SensitiveAction action;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private ApprovalStatus status;

    /** Entity class this act would affect, e.g. {@code Document}. */
    @Column(name = "target_type", nullable = false, length = 64)
    private String targetType;

    @Column(name = "target_id", nullable = false, length = 64)
    private String targetId;

    /**
     * Human-readable name of the target, captured at request time. Held as a
     * copy on purpose: after the act runs the target may not exist any more, and
     * an audit record saying "disposed of 3f2a-..." is not reviewable.
     */
    @Column(name = "target_label", length = 512)
    private String targetLabel;

    /** Why the requester says this is necessary. Mandatory - the gate rejects blank. */
    @Column(name = "justification", columnDefinition = "TEXT", nullable = false)
    private String justification;

    /**
     * Opaque JSON the executor needs to carry the act out (for example the new
     * classification level for a declassification). Captured at request time so
     * approvers authorise a specific act, not a blank cheque the requester can
     * fill in afterwards.
     */
    @Column(name = "payload_json", columnDefinition = "TEXT")
    private String payloadJson;

    // --- requester identity ---

    @Column(name = "requested_by_id", nullable = false)
    private UUID requestedById;

    @Column(name = "requested_by_email", nullable = false, length = 255)
    private String requestedByEmail;

    @Column(name = "requested_by_name", length = 255)
    private String requestedByName;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    /** After this instant the request can no longer be approved. */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    // --- quorum ---

    /**
     * Copied from the policy at request time rather than read live. If the policy
     * is later tightened, an in-flight request keeps the terms the approvers were
     * shown; loosening the policy cannot retroactively satisfy a request that is
     * already waiting on two signatures.
     */
    @Column(name = "required_approvals", nullable = false)
    private int requiredApprovals;

    @Column(name = "approval_count", nullable = false)
    private int approvalCount;

    // --- execution ---

    @Column(name = "executed_at")
    private LocalDateTime executedAt;

    @Column(name = "executed_by_email", length = 255)
    private String executedByEmail;

    @Column(name = "execution_error", columnDefinition = "TEXT")
    private String executionError;

    // --- AI advisory fields: recommendation only, never authority ---

    @Enumerated(EnumType.STRING)
    @Column(name = "ai_risk_level", length = 16)
    private AiRiskLevel aiRiskLevel;

    @Column(name = "ai_rationale", columnDefinition = "TEXT")
    private String aiRationale;

    /**
     * True when a human approved something the AI recommended refusing. Not an
     * error - humans are the deciders - but it is the single most useful thing
     * to be able to search for afterwards, so it is stored rather than derived.
     */
    @Column(name = "approved_against_ai_advice", nullable = false)
    private boolean approvedAgainstAiAdvice;

    public boolean isPending() {
        return status == ApprovalStatus.PENDING;
    }

    public boolean isExpired(LocalDateTime now) {
        return expiresAt != null && now.isAfter(expiresAt);
    }

    /** True once enough distinct approvers have signed. */
    public boolean hasQuorum() {
        return approvalCount >= requiredApprovals;
    }
}
