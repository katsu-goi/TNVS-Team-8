package com.photonicomega.facilities.module.security.service;

import com.photonicomega.facilities.module.security.domain.*;
import com.photonicomega.facilities.module.security.repository.*;
import com.photonicomega.facilities.module.admin.service.AdminNotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class SecurityAuditService {

    private final SecurityLogRepository securityLogRepository;
    private final BlockedIpRepository blockedIpRepository;
    private final ActiveSessionRepository activeSessionRepository;
    private final SecurityAlertRepository securityAlertRepository;
    private final LoginHistoryRepository loginHistoryRepository;
    private final ApiRequestLogRepository apiRequestLogRepository;
    private final AdminNotificationService adminNotificationService;

    @Async
    @Transactional
    public void logSecurityEventAsync(SecurityLog logEntry) {
        try {
            securityLogRepository.save(logEntry);
            log.info("ASYNC SECURITY AUDIT LOGGED: [{}] {} - IP: {}", logEntry.getRiskLevel(), logEntry.getAction(), logEntry.getIpAddress());
        } catch (Exception e) {
            log.error("Failed to record async security audit log", e);
        }
    }

    @Async
    @Transactional
    public void logLoginAttemptAsync(String username, String userId, String ip, String status, String reason, String userAgent) {
        LoginHistory history = LoginHistory.builder()
                .username(username)
                .userId(userId)
                .ipAddress(ip)
                .status(status)
                .failureReason(reason)
                .userAgent(userAgent)
                .timestamp(Instant.now())
                .build();
        loginHistoryRepository.save(history);
    }

    @Transactional
    public BlockedIp blockIpAddress(String ipAddress, String reason, String blockedBy, Long durationMinutes) {
        Instant expiresAt = (durationMinutes != null && durationMinutes > 0) 
                ? Instant.now().plusSeconds(durationMinutes * 60) 
                : null;

        BlockedIp blockedIp = BlockedIp.builder()
                .ipAddress(ipAddress)
                .reason(reason)
                .blockedBy(blockedBy)
                .expiresAt(expiresAt)
                .status("ACTIVE")
                .build();

        log.warn("SECURITY BLACKLIST: IP {} blocked by {}. Reason: {}", ipAddress, blockedBy, reason);
        return blockedIpRepository.save(blockedIp);
    }

    @Transactional
    public void unblockIpAddress(String ipAddress) {
        blockedIpRepository.findByIpAddressAndStatus(ipAddress, "ACTIVE").ifPresent(blocked -> {
            blocked.setStatus("UNBLOCKED");
            blockedIpRepository.save(blocked);
            log.info("SECURITY BLACKLIST: IP {} unblocked.", ipAddress);
        });
    }

    @Transactional
    public void createSecurityAlert(String title, String description, RiskLevel severity, String alertType, String ip, String userId) {
        SecurityAlert alert = SecurityAlert.builder()
                .title(title)
                .description(description)
                .severity(severity)
                .alertType(alertType)
                .targetIp(ip)
                .targetUserId(userId)
                .status("UNRESOLVED")
                .build();
        securityAlertRepository.save(alert);
        log.error("SECURITY ALERT TRIGGERED [{}]: {} - {}", severity, title, description);
        if (severity == RiskLevel.HIGH || severity == RiskLevel.CRITICAL) {
            adminNotificationService.notifyAdmins("SECURITY", severity.name(),
                    "Security alert: " + title,
                    "A " + severity.name() + " security alert was triggered: " + description,
                    "SecurityAlert", alert.getId().toString());
        }
    }
}
