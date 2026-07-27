package com.photonicomega.security.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "api_request_logs", indexes = {
        @Index(name = "idx_api_req_user_id", columnList = "user_id"),
        @Index(name = "idx_api_req_endpoint", columnList = "endpoint"),
        @Index(name = "idx_api_req_timestamp", columnList = "timestamp")
})
@Getter
@Setter
@NoArgsConstructor
public class ApiRequestLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "endpoint", nullable = false)
    private String endpoint;

    @Column(name = "http_method", nullable = false)
    private String httpMethod;

    @Column(name = "timestamp", nullable = false)
    private OffsetDateTime timestamp = OffsetDateTime.now();

    @Column(name = "ip_address", nullable = false)
    private String ipAddress;

    @Column(name = "request_body", columnDefinition = "jsonb")
    private String requestBody;

    @Column(name = "response_status")
    private Integer responseStatus;

    @Column(name = "response_body", columnDefinition = "jsonb")
    private String responseBody;

    @Column(name = "risk_level")
    private String riskLevel;
}
