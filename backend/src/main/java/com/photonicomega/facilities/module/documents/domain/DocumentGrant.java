package com.photonicomega.facilities.module.documents.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * Explicit document-level sharing grant. The only mechanism that widens (or
 * narrows) the default {@code DocumentAccessPolicy} for a single document:
 * a role or an individual user is granted VIEW or DOWNLOAD on one document.
 *
 * <p>Governance roles (SUPER_ADMIN, COMPLIANCE_OFFICER, LEGAL_OFFICER) do
 * NOT need grant rows - their cross-department access comes from policy.
 */
@Entity
@Table(name = "document_grants", uniqueConstraints = {
        @UniqueConstraint(name = "uk_document_grants_doc_grantee",
                columnNames = {"document_id", "grantee_type", "grantee_key"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentGrant extends BaseEntity {

    @Column(name = "document_id", nullable = false)
    private UUID documentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "grantee_type", nullable = false, length = 20)
    private DocumentGranteeType granteeType;

    /**
     * For USER grantees: the user's email (compared case-insensitively).
     * For ROLE grantees: the role name (e.g. {@code CONTRACT_OFFICER}).
     */
    @Column(name = "grantee_key", nullable = false, length = 100)
    private String granteeKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "access_level", nullable = false, length = 20)
    private DocumentGrantAccessLevel accessLevel;

    /** Optional human-readable note describing why the grant was created. */
    @Column(name = "reason", length = 255)
    private String reason;
}
