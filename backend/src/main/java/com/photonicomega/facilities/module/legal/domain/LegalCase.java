package com.photonicomega.facilities.module.legal.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import com.photonicomega.facilities.module.auth.domain.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Entity
@Table(name = "legal_cases")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LegalCase extends BaseEntity {

    @Column(nullable = false, unique = true)
    private String caseNumber;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String courtName;
    private String judgeName;
    private String opposingParty;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CaseStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CasePriority priority;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lead_lawyer_id")
    private User leadLawyer;

    private LocalDate filingDate;
    private LocalDate expectedResolutionDate;
}
