package com.photonicomega.facilities.module.contracts.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import com.photonicomega.facilities.module.documents.domain.Document;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "contracts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Contract extends BaseEntity {

    @Column(nullable = false, unique = true)
    private String contractNumber;

    @Column(nullable = false)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ContractType type;

    private String counterParty;
    private BigDecimal contractValue;

    private LocalDate startDate;
    private LocalDate endDate;
    private LocalDate renewalNoticeDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ContractStatus status;

    @Enumerated(EnumType.STRING)
    private RiskLevel aiAssessedRiskLevel;

    @Column(columnDefinition = "TEXT")
    private String aiRiskSummary;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id")
    private Document associatedDocument;

    @OneToMany(mappedBy = "contract", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ContractClause> clauses = new ArrayList<>();
}
