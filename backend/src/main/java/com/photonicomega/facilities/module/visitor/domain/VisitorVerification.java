package com.photonicomega.facilities.module.visitor.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One verification attempt against one visitor: the ID that was presented,
 * what the heuristic parser made of it, and whether the visitor matched the
 * watchlist.
 *
 * <p>Rows are never updated in place - re-verifying a visitor appends a new
 * row so the lobby keeps a full history of who was screened and when.
 *
 * <p>{@code visitorId} is a loose uuid rather than a {@code @ManyToOne}: the
 * migration declares no FK (consistent with {@code documents.retention_policy_id}),
 * and a plain uuid keeps this entity serialisable with {@code open-in-view}
 * disabled without needing an EAGER fetch or a DTO hop.
 */
@Entity
@Table(name = "visitor_verifications")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VisitorVerification extends BaseEntity {

    @Column(name = "visitor_id", nullable = false)
    private UUID visitorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "id_type")
    private IdType idType;

    @Column(name = "id_number")
    private String idNumber;

    /**
     * Parsed ID components as a JSON object. {@code SqlTypes.JSON} is Hibernate 6's
     * native mapping - it targets the {@code jsonb} column the migration creates
     * without pulling in a JSON-type dependency.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "extracted_fields")
    private String extractedFields;

    @Column(name = "match_score", precision = 5, scale = 2)
    private BigDecimal matchScore;

    @Enumerated(EnumType.STRING)
    @Column(name = "watchlist_status", nullable = false)
    @Builder.Default
    private WatchlistStatus watchlistStatus = WatchlistStatus.CLEAR;

    @Enumerated(EnumType.STRING)
    @Column(name = "verification_status", nullable = false)
    @Builder.Default
    private VerificationStatus verificationStatus = VerificationStatus.PENDING;

    @Column(name = "verified_at")
    private LocalDateTime verifiedAt;

    @Column(name = "verified_by")
    private String verifiedBy;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
