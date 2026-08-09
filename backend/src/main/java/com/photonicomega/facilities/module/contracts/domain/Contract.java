package com.photonicomega.facilities.module.contracts.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import com.photonicomega.facilities.module.documents.domain.Document;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

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

    // Optional link to a procurement Vendor. Stored as a plain column (not a JPA
    // association) so the shared contracts module keeps no dependency on the
    // procurement module. Nullable — legacy/legal contracts leave it unset.
    private UUID vendorId;

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

    @OneToMany(mappedBy = "contract", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.EAGER)
    @BatchSize(size = 50)
    @Builder.Default
    private List<ContractClause> clauses = new ArrayList<>();
}
