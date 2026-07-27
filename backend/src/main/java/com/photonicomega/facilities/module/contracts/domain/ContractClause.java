package com.photonicomega.facilities.module.contracts.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "contract_clauses")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContractClause extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contract_id", nullable = false)
    private Contract contract;

    @Column(nullable = false)
    private String clauseType; // E.g., Termination, Liability, Indemnity, Payment

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    @Enumerated(EnumType.STRING)
    private RiskLevel riskLevel;

    private String aiAnalysisNotes;
}
