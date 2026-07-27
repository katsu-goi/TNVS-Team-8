package com.photonicomega.security.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
public class AuditEvent {
    private UUID userId;
    private String fullName;
    private String role;
    private String module;
    private String action;
    private OffsetDateTime timestamp;
    private String ipAddress;
    private String browser;
    private String os;
    private String device;
    private UUID sessionId;
    private String apiEndpoint;
    private String httpMethod;
    private String affectedRecord;
    private String previousValue;
    private String newValue;
    private String riskLevel;
    private String status;
}
