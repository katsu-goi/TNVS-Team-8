package com.photonicomega.facilities.module.auth.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Privacy-preserving state for attempted identifiers that are not user rows.
 * It deliberately reuses rate_limit_counts instead of introducing a second
 * failed-login table. The key is an HMAC reference, never the submitted email.
 */
@Entity
@Table(name = "rate_limit_counts", uniqueConstraints =
        @UniqueConstraint(name = "idx_rate_limit_counts_key_window", columnNames = {"limit_key", "window_start"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoginIdentifierAttempt {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "limit_key", nullable = false)
    private String limitKey;

    @Column(name = "window_start", nullable = false)
    private long windowStart;

    @Column(name = "request_count", nullable = false)
    private int requestCount;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
