package com.photonicomega.facilities.module.procurement.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Entity
@Table(name = "vendor_obligations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VendorObligation extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vendor_id", nullable = false)
    private Vendor vendor;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ObligationStatus status;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
