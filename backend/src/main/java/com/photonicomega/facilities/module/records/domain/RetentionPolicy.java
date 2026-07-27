package com.photonicomega.facilities.module.records.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "retention_policies")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RetentionPolicy extends BaseEntity {

    @Column(nullable = false, unique = true)
    private String name;

    private String description;

    @Column(nullable = false)
    private Integer retentionPeriodDays;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PolicyAction actionOnExpiry;

    private Boolean active;
}
