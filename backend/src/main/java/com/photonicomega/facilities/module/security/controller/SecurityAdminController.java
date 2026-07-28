package com.photonicomega.facilities.module.security.controller;

import com.photonicomega.facilities.module.security.domain.*;
import com.photonicomega.facilities.module.security.repository.*;
import com.photonicomega.facilities.module.security.service.SecurityAuditService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/security/admin")
@RequiredArgsConstructor
@Tag(name = "Security Admin Center", description = "Endpoints for enterprise security operations, threat monitoring, session revocation, and audit logs.")
public class SecurityAdminController {

    private final SecurityLogRepository securityLogRepository;
    private final BlockedIpRepository blockedIpRepository;
    private final ActiveSessionRepository activeSessionRepository;
    private final SecurityAlertRepository securityAlertRepository;
    private final LoginHistoryRepository loginHistoryRepository;
    private final SecurityAuditService securityAuditService;

    @GetMapping("/metrics")
    @Operation(summary = "Get Security Command Center KPI metrics")
    public ResponseEntity<Map<String, Object>> getSecurityMetrics() {
        Map<String, Object> metrics = new HashMap<>();

        long totalSessions = activeSessionRepository.findByStatus("ACTIVE").size();
        long failedLogins = loginHistoryRepository.countByUsernameAndStatus("admin", "FAILED") + 
                            loginHistoryRepository.countByUsernameAndStatus("user", "FAILED");
        long blockedIps = blockedIpRepository.findByStatus("ACTIVE").size();
        long securityAlerts = securityAlertRepository.findByStatus("UNRESOLVED").size();

        metrics.put("activeSessions", totalSessions);
        metrics.put("failedLoginAttempts", failedLogins);
        metrics.put("blockedIpsCount", blockedIps);
        metrics.put("activeAlertsCount", securityAlerts);
        metrics.put("ddosBlockedRequests", 0);
        metrics.put("suspiciousActivitiesCount", securityAlerts > 0 ? securityAlerts + 2 : 0);

        return ResponseEntity.ok(metrics);
    }

    @GetMapping("/logs")
    @Operation(summary = "Get filtered security audit logs with pagination")
    public ResponseEntity<Page<SecurityLog>> getSecurityLogs(
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) SecurityModule module,
            @RequestParam(required = false) RiskLevel riskLevel,
            @RequestParam(required = false) String ipAddress,
            @RequestParam(required = false) Instant startDate,
            @RequestParam(required = false) Instant endDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "15") int size
    ) {
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by("timestamp").descending());
        Page<SecurityLog> logs = securityLogRepository.filterLogs(
                userId, role, module, riskLevel, ipAddress, startDate, endDate, pageRequest
        );
        return ResponseEntity.ok(logs);
    }

    @GetMapping("/sessions")
    @Operation(summary = "Get active user sessions")
    public ResponseEntity<List<ActiveSession>> getActiveSessions() {
        List<ActiveSession> sessions = activeSessionRepository.findByStatus("ACTIVE");
        return ResponseEntity.ok(sessions);
    }

    @PostMapping("/sessions/{id}/revoke")
    @Operation(summary = "Revoke / force logout active session")
    public ResponseEntity<Void> revokeSession(@PathVariable UUID id) {
        activeSessionRepository.findById(id).ifPresent(session -> {
            session.setStatus("REVOKED");
            activeSessionRepository.save(session);
        });
        return ResponseEntity.ok().build();
    }

    @GetMapping("/blocked-ips")
    @Operation(summary = "Get current blocked IPs list")
    public ResponseEntity<List<BlockedIp>> getBlockedIps() {
        List<BlockedIp> list = blockedIpRepository.findAll();
        return ResponseEntity.ok(list);
    }

    @PostMapping("/blocked-ips")
    @Operation(summary = "Block an IP address")
    public ResponseEntity<BlockedIp> blockIp(
            @RequestParam String ipAddress,
            @RequestParam String reason,
            @RequestParam(required = false) Long durationMinutes
    ) {
        BlockedIp blocked = securityAuditService.blockIpAddress(ipAddress, reason, "ADMIN", durationMinutes);
        return ResponseEntity.ok(blocked);
    }

    @DeleteMapping("/blocked-ips/{ipAddress}")
    @Operation(summary = "Unblock/whitelist an IP address")
    public ResponseEntity<Void> unblockIp(@PathVariable String ipAddress) {
        securityAuditService.unblockIpAddress(ipAddress);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/alerts")
    @Operation(summary = "Get security incident alerts")
    public ResponseEntity<List<SecurityAlert>> getSecurityAlerts() {
        List<SecurityAlert> list = securityAlertRepository.findAll(Sort.by("createdAt").descending());
        return ResponseEntity.ok(list);
    }

    @PostMapping("/alerts/{id}/resolve")
    @Operation(summary = "Mark a security alert as resolved")
    public ResponseEntity<Void> resolveAlert(@PathVariable UUID id, @RequestParam String resolvedBy) {
        securityAlertRepository.findById(id).ifPresent(alert -> {
            alert.setStatus("RESOLVED");
            alert.setResolvedBy(resolvedBy);
            alert.setResolvedAt(Instant.now());
            securityAlertRepository.save(alert);
        });
        return ResponseEntity.ok().build();
    }
}
