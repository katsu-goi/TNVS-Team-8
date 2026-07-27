package com.photonicomega.security.controller;

import com.photonicomega.security.dto.SecurityOverviewDTO;
import com.photonicomega.security.entity.*;
import com.photonicomega.security.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/security")
@PreAuthorize("hasRole('ADMIN')")
public class SecurityAdminController {

    private final SecurityLogRepository securityLogRepository;
    private final LoginHistoryRepository loginHistoryRepository;
    private final ActiveSessionRepository activeSessionRepository;
    private final BlockedIpRepository blockedIpRepository;
    private final SecurityAlertRepository securityAlertRepository;

    @Autowired
    public SecurityAdminController(SecurityLogRepository securityLogRepository,
                                   LoginHistoryRepository loginHistoryRepository,
                                   ActiveSessionRepository activeSessionRepository,
                                   BlockedIpRepository blockedIpRepository,
                                   SecurityAlertRepository securityAlertRepository) {
        this.securityLogRepository = securityLogRepository;
        this.loginHistoryRepository = loginHistoryRepository;
        this.activeSessionRepository = activeSessionRepository;
        this.blockedIpRepository = blockedIpRepository;
        this.securityAlertRepository = securityAlertRepository;
    }

    // 1. Overview metrics
    @GetMapping("/overview")
    public ResponseEntity<SecurityOverviewDTO> getOverview() {
        long totalEvents = securityLogRepository.count();
        long failedLogins = loginHistoryRepository.count((root, query, cb) -> cb.equal(root.get("success"), false));
        long activeSessions = activeSessionRepository.count();
        long blockedIps = blockedIpRepository.count();
        long openAlerts = securityAlertRepository.count((root, query, cb) -> cb.equal(root.get("status"), "OPEN"));
        SecurityOverviewDTO dto = new SecurityOverviewDTO(totalEvents, failedLogins, activeSessions, blockedIps, openAlerts);
        return ResponseEntity.ok(dto);
    }

    // 2. Audit logs with pagination and optional filters
    @GetMapping("/logs")
    public ResponseEntity<Page<SecurityLog>> getLogs(
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String riskLevel,
            @RequestParam(required = false) String ipAddress,
            @RequestParam(required = false) OffsetDateTime from,
            @RequestParam(required = false) OffsetDateTime to,
            Pageable pageable) {
        // Simplified filtering – in production use Specification or Querydsl
        Page<SecurityLog> page = securityLogRepository.findAll(pageable);
        return ResponseEntity.ok(page);
    }

    // 3. Active sessions list
    @GetMapping("/sessions")
    public ResponseEntity<List<ActiveSession>> getActiveSessions() {
        List<ActiveSession> sessions = activeSessionRepository.findAll();
        return ResponseEntity.ok(sessions);
    }

    // 4. Blocked IPs list
    @GetMapping("/blocked-ips")
    public ResponseEntity<List<BlockedIp>> getBlockedIps() {
        List<BlockedIp> ips = blockedIpRepository.findAll();
        return ResponseEntity.ok(ips);
    }

    // 5. Security alerts list with optional filters
    @GetMapping("/alerts")
    public ResponseEntity<List<SecurityAlert>> getAlerts(
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String status) {
        if (severity != null && status != null) {
            return ResponseEntity.ok(securityAlertRepository.findBySeverity(severity).stream()
                    .filter(a -> a.getStatus().equalsIgnoreCase(status))
                    .toList());
        } else if (severity != null) {
            return ResponseEntity.ok(securityAlertRepository.findBySeverity(severity));
        } else if (status != null) {
            return ResponseEntity.ok(securityAlertRepository.findByStatus(status));
        } else {
            return ResponseEntity.ok(securityAlertRepository.findAll());
        }
    }

    // 6. Add a blocked IP
    @PostMapping("/blocked-ips")
    public ResponseEntity<BlockedIp> blockIp(@RequestBody BlockedIp ip) {
        ip.setBlockedAt(OffsetDateTime.now());
        ip.setStatus("BLOCKED");
        BlockedIp saved = blockedIpRepository.save(ip);
        return ResponseEntity.ok(saved);
    }

    // 7. Acknowledge / resolve an alert
    @PostMapping("/alerts/{id}/acknowledge")
    public ResponseEntity<SecurityAlert> acknowledgeAlert(@PathVariable Long id) {
        var alertOpt = securityAlertRepository.findById(id);
        if (alertOpt.isPresent()) {
            SecurityAlert alert = alertOpt.get();
            alert.setStatus("ACKNOWLEDGED");
            securityAlertRepository.save(alert);
            return ResponseEntity.ok(alert);
        }
        return ResponseEntity.notFound().build();
    }

    // 8. Force logout / revoke a session
    @PostMapping("/sessions/{id}/revoke")
    public ResponseEntity<Void> revokeSession(@PathVariable UUID id) {
        activeSessionRepository.deleteById(id);
        return ResponseEntity.ok().build();
    }
}
