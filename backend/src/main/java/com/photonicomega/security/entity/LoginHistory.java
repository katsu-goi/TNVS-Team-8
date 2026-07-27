package com.photonicomega.security.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "login_history", indexes = {
        @Index(name = "idx_login_hist_user_id", columnList = "user_id"),
        @Index(name = "idx_login_hist_ip_address", columnList = "ip_address"),
        @Index(name = "idx_login_hist_timestamp", columnList = "timestamp")
})
@Getter
@Setter
@NoArgsConstructor
public class LoginHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "timestamp", nullable = false)
    private OffsetDateTime timestamp = OffsetDateTime.now();

    @Column(name = "ip_address", nullable = false)
    private String ipAddress;

    @Column(name = "success", nullable = false)
    private Boolean success;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "mfa_verified")
    private Boolean mfaVerified;

    private String device;
    private String browser;
    private String os;
}
