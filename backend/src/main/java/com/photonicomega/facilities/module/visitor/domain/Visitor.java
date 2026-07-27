package com.photonicomega.facilities.module.visitor.domain;

import com.photonicomega.facilities.common.domain.BaseEntity;
import com.photonicomega.facilities.module.auth.domain.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "visitors")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Visitor extends BaseEntity {

    @Column(nullable = false)
    private String fullName;

    @Column(nullable = false)
    private String email;

    private String phoneNumber;
    private String company;
    private String idNumber;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "host_id", nullable = false)
    private User host;

    @Column(nullable = false)
    private String purposeOfVisit;

    @Column(nullable = false)
    private LocalDateTime expectedArrival;

    private LocalDateTime actualArrival;
    private LocalDateTime actualDeparture;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private VisitorStatus status;

    @Column(unique = true)
    private String qrCodeToken;

    private String badgeNumber;
}
