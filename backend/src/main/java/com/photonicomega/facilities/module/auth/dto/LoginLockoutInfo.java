package com.photonicomega.facilities.module.auth.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;

import java.time.Instant;

/** Public failures expose only retry timing; counters remain server-side. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginLockoutInfo {
    @JsonIgnore
    private int failedAttempts;
    @JsonIgnore
    private boolean accountExists;
    @JsonIgnore
    private boolean counted;
    @JsonIgnore
    private String identifierReference;

    private long lockSecondsRemaining;
    private Instant retryAt;
}
