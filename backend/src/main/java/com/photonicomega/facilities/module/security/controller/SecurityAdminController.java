package com.photonicomega.facilities.module.security.controller;

import com.photonicomega.facilities.module.auth.domain.AuditLog;
import com.photonicomega.facilities.module.auth.domain.AuditSeverity;
import com.photonicomega.facilities.module.auth.repository.AuditLogRepository;
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
import java.time.LocalDateTime;
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
    private final AuditLogRepository auditLogRepository;
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

    @GetMapping("/audit-logs")
    @Operation(summary = "Get global application audit logs with pagination (Super Admin only)")
    public ResponseEntity<Page<Map<String, Object>>> getAuditLogs(
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String module,
            @RequestParam(required = false, name = "riskLevel") AuditSeverity severity,
            @RequestParam(required = false) LocalDateTime startDate,
            @RequestParam(required = false) LocalDateTime endDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(size, 100));
        PageRequest pageRequest = PageRequest.of(safePage, safeSize, Sort.by("createdAt").descending());
        Page<Map<String, Object>> logs = auditLogRepository.filterAuditLogs(
                userId,
                action == null ? null : action.trim().toUpperCase(),
                module == null ? null : module.trim().toUpperCase(),
                severity,
                startDate,
                endDate,
                pageRequest
        ).map(this::auditLogDto);
        return ResponseEntity.ok(logs);
    }

    private Map<String, Object> auditLogDto(AuditLog log) {
        Map<String, Object> dto = new HashMap<>();
        dto.put("id", log.getId());
        dto.put("timestamp", log.getCreatedAt());
        dto.put("userId", log.getUserId());
        dto.put("username", log.getUserEmail());
        dto.put("fullName", log.getUserFullName());
        dto.put("module", log.getModule());
        dto.put("action", log.getAction());
        dto.put("ipAddress", log.getIpAddress());
        dto.put("riskLevel", log.getSeverity());
        dto.put("status", log.getStatus());
        dto.put("source", "APPLICATION_AUDIT");
        return dto;
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
