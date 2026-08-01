package com.photonicomega.facilities.module.procurement.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "vendors")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Vendor extends BaseEntity {

    @Column(nullable = false, unique = true)
    private String vendorCode;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    private VendorCategory category;

    private String contactName;
    private String contactEmail;
    private String contactPhone;

    @Column(columnDefinition = "TEXT")
    private String address;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private VendorStatus status;

    private Integer performanceScore; // 0-100
    private BigDecimal slaComplianceRate; // percentage

    @Column(columnDefinition = "TEXT")
    private String notes;

    @OneToMany(mappedBy = "vendor", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<VendorObligation> obligations = new ArrayList<>();
}
