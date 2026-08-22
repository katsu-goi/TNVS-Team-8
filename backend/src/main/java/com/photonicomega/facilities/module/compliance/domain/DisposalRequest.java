package com.photonicomega.facilities.module.compliance.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A request to dispose of (permanently remove) an archived document. Kept as its
 * own entity so the reason, approver, and decision survive the document's
 * deletion.
 *
 * <p>This entity used to be the whole control, and it was not one: it recorded
 * who <em>decided</em> but never who <em>asked</em>, so nothing could compare the
 * two. One officer could raise a disposal and approve it seconds later and the
 * record would look identical to a properly reviewed one.
 *
 * <p>It is now a view onto a governed approval. Every disposal request is backed
 * by an {@code ApprovalRequest} - see {@code approvalRequestId} - and the decision
 * is taken by the approval gate, which enforces that the approver is a different
 * person holding a role with the authority to sign off. The requester identity
 * below is captured for the same reason the gate stores it: comparison for the
 * four-eyes rule has to be on a stable user id, not a mutable e-mail string.
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

    // ------------------------------------------------------------------
    // Requester identity and the link to the governed approval.
    // ------------------------------------------------------------------

    /**
     * The user who asked for this disposal. Nullable only so rows written before
     * the approval gate existed still load; the gate refuses to decide any
     * request where this is null, rather than falling back to "no comparison
     * possible, therefore allow".
     */
    @Column(name = "requested_by_id")
    private UUID requestedById;

    @Column(name = "requested_by_email")
    private String requestedByEmail;

    /**
     * The {@code ApprovalRequest} that actually holds the authority for this
     * disposal. The document is destroyed by the gate executing that request -
     * never by this entity changing status.
     */
    @Column(name = "approval_request_id")
    private UUID approvalRequestId;
}
