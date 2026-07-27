package com.photonicomega.security.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "active_sessions", indexes = {
        @Index(name = "idx_active_sessions_user_id", columnList = "user_id"),
        @Index(name = "idx_active_sessions_ip_address", columnList = "ip_address")
})
@Getter
@Setter
@NoArgsConstructor
public class ActiveSession {
    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "username", nullable = false)
    private String username;

    @Column(name = "ip_address", nullable = false)
    private String ipAddress;

    @Column(name = "login_time", nullable = false)
    private OffsetDateTime loginTime = OffsetDateTime.now();

    @Column(name = "last_activity", nullable = false)
    private OffsetDateTime lastActivity = OffsetDateTime.now();

    private String device;
    private String browser;
    private String os;
}
