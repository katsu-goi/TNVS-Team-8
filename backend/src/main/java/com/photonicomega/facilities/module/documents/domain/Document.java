package com.photonicomega.facilities.module.documents.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "documents")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Document extends BaseEntity {

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String fileName;

    private String fileType;
    private Long fileSize;

    private String filePath;
    private String supabaseStorageUrl;

    /**
     * Owner attribution for access control. Set from the authenticated caller
     * on create/upload; drives the {@code owner-scoped} branch of
     * {@code DocumentAccessPolicy}. Mirrors {@code created_by} but survives
     * import/seed rows that bypass Spring Data auditing.
     */
    @Column(name = "owner_email")
    private String ownerEmail;

    /**
     * Department that owns the document, copied from the creator's
     * {@code users.department} on create/upload. Department comparison in
     * {@code DocumentAccessPolicy} is case-insensitive.
     */
    @Column(name = "department")
    private String department;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id")
    private Folder folder;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ClassificationLevel classificationLevel;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DocumentStatus status;

    @Column(columnDefinition = "TEXT")
    private String ocrExtractedText;

    @Column(columnDefinition = "TEXT")
    private String aiSummary;

    private String aiPredictedCategory;

    /**
     * AI classification confidence, 0.00 - 1.00.
     * Maps onto the pre-existing documents.confidence_score numeric(5,2)
     * column (created by 00001 / Flyway V2) - no migration is required.
     */
    @Column(name = "confidence_score", precision = 5, scale = 2)
    private BigDecimal confidenceScore;

    /**
     * Fetched eagerly: the app runs with open-in-view disabled, so a lazy
     * collection would already be detached by the time Jackson serialises
     * the document on GET /v1/documents and /v1/documents/search. Tag has no
     * back-reference to Document, so there is no recursion risk.
     */
    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
        name = "document_tags",
        joinColumns = @JoinColumn(name = "document_id"),
        inverseJoinColumns = @JoinColumn(name = "tag_id")
    )
    @BatchSize(size = 50)
    @Builder.Default
    private Set<Tag> tags = new HashSet<>();

    private Integer versionNumber;

    /**
     * Retention policy assigned by
     * {@code ComplianceService#applyRetentionToDocuments()}. Stored as a loose
     * uuid rather than a JPA association so the documents module keeps no
     * compile-time dependency on the records module - the same pattern as
     * {@code Contract.vendorId}. Null until the nightly retention job (or a
     * manual run) matches the document's category to a retention policy.
     */
    @Column(name = "retention_policy_id")
    private UUID retentionPolicyId;

    /**
     * {@code createdAt + policy.retentionPeriodDays}. Drives the
     * RETENTION_EXPIRING / RETENTION_EXPIRED compliance alerts.
     */
    @Column(name = "retention_expires_at")
    private LocalDateTime retentionExpiresAt;
}
