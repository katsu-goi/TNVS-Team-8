package com.photonicomega.facilities.module.visitor.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * A name / ID number that must be flagged if it turns up at the lobby.
 *
 * <p>{@code status} is a free-form string rather than an enum ({@code ACTIVE} /
 * {@code INACTIVE}) so an entry can be retired without losing the record of why
 * it existed. Only {@code ACTIVE} rows are screened against.
 */
@Entity
@Table(name = "visitor_watchlist")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VisitorWatchlist extends BaseEntity {

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "id_number")
    private String idNumber;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @Column(nullable = false)
    @Builder.Default
    private String status = "ACTIVE";
}
