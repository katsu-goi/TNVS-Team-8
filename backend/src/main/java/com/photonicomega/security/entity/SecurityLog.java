package com.photonicomega.security.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "security_logs", indexes = {
        @Index(name = "idx_sec_logs_user_id", columnList = "user_id"),
        @Index(name = "idx_sec_logs_ip_address", columnList = "ip_address"),
        @Index(name = "idx_sec_logs_timestamp", columnList = "timestamp"),
        @Index(name = "idx_sec_logs_module", columnList = "module"),
        @Index(name = "idx_sec_logs_action", columnList = "action"),
        @Index(name = "idx_sec_logs_risk_level", columnList = "risk_level")
})
@Getter
@Setter
@NoArgsConstructor
public class SecurityLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "role", nullable = false)
    private String role;

    @Column(name = "module", nullable = false)
    private String module;

    @Column(name = "action", nullable = false)
    private String action;

    @Column(name = "timestamp", nullable = false)
    private OffsetDateTime timestamp = OffsetDateTime.now();

    @Column(name = "ip_address", nullable = false)
    private String ipAddress;

    private String browser;
    private String os;
    private String device;

    @Column(name = "session_id")
    private UUID sessionId;

    @Column(name = "api_endpoint")
    private String apiEndpoint;

    @Column(name = "http_method")
    private String httpMethod;

    @Column(name = "affected_record")
    private String affectedRecord;

    @Column(name = "previous_value", columnDefinition = "jsonb")
    private String previousValue;

    @Column(name = "new_value", columnDefinition = "jsonb")
    private String newValue;

    @Column(name = "risk_level")
    private String riskLevel;

    @Column(name = "status")
    private String status;
}
