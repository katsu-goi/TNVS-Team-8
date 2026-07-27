package com.photonicomega.security.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SecurityOverviewDTO {
    private long totalEvents;
    private long failedLogins;
    private long activeSessions;
    private long blockedIps;
    private long openAlerts;
}
