package com.photonicomega.facilities.module.security.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "api_request_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApiRequestLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private Instant timestamp;

    @Column(nullable = false, length = 45)
    private String ipAddress;

    @Column(nullable = false)
    private String url;

    @Column(nullable = false, length = 10)
    private String method;

    @Column(nullable = false)
    private Integer statusCode;

    @Column(nullable = false)
    private Long responseTimeMs;

    @Column(columnDefinition = "TEXT")
    private String userAgent;

    private Long payloadSizeBytes;
    private String userId;

    @PrePersist
    public void prePersist() {
        if (timestamp == null) timestamp = Instant.now();
    }
}
