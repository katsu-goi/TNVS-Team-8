package com.photonicomega.facilities.module.security.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.GovernedActionGateway;
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
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
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

    /**
     * How much of a block's original reason is carried into the approval's label.
     *
     * <p>The label column holds 512 characters and the stored reason is unbounded
     * text, so an over-long one is cut when the label is built rather than failing
     * the insert that records the request.
     */
    private static final int REASON_LABEL_LIMIT = 400;

    private final SecurityLogRepository securityLogRepository;
    private final BlockedIpRepository blockedIpRepository;
    private final ActiveSessionRepository activeSessionRepository;
    private final SecurityAlertRepository securityAlertRepository;
    private final LoginHistoryRepository loginHistoryRepository;
    private final SecurityAuditService securityAuditService;
    private final GovernedActionGateway governedActions;
    private final UserRepository userRepository;

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

    /**
     * Requests revocation of an active session. Does not revoke it.
     *
     * <p>This is the cheapest act in the gated catalogue and usually the right one:
     * cutting a suspect login during an incident is a reflex worth having, and the
     * cost of being wrong is that somebody signs in again. It is gated for the
     * opposite reason to the others, which is that an unattributed session ending
     * looks exactly like the thing it is meant to stop. A row that flips to REVOKED
     * with nobody's name against it is indistinguishable from a session an intruder
     * closed behind themselves, and by the time anyone reviews it the session is
     * gone and there is nothing left to inspect. The signature is what makes the
     * record able to say which of the two happened.
     *
     * <p>The verb, path and envelope are unchanged and the status is still
     * {@code 200}, so the security console keeps working. What differs is that the
     * session is still ACTIVE when this returns: {@code SessionRevokeExecutor} ends
     * it once {@link SensitiveAction#SESSION_REVOKE} has been signed off. That
     * executor identifies its target by the session's {@code sessionId} rather than
     * by the row id in this URL, which is why the id is translated here.
     */
    @PostMapping("/sessions/{id}/revoke")
    @Operation(summary = "Request revocation of an active session (requires approval; revokes nothing)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> revokeSession(
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, Object> body,
            @RequestParam(required = false) String reason,
            @AuthenticationPrincipal UserDetails userDetails) {
        // Loaded before the request is raised so an unknown id fails now, rather
        // than after an approver has spent a signature on a session that was never
        // there.
        ActiveSession session = activeSessionRepository.findById(id)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "Session " + id + " does not exist, so its revocation cannot be requested."));
        if (!"ACTIVE".equals(session.getStatus())) {
            throw new BusinessRuleViolationException("Session " + id + " is not active (status "
                    + session.getStatus() + "), so there is nothing to revoke.");
        }

        GovernedActionGateway.Raised raised = governedActions.raise(
                SensitiveAction.SESSION_REVOKE, "ActiveSession", session.getSessionId(),
                describeSession(session), body, reason, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(raised.dto(), raised.message()));
    }

    /**
     * A label an approver can recognise without opening the session list.
     *
     * <p>The session's own identifier is a random UUID and tells a human nothing, so
     * the account and the address it is signed in from are named instead. Those are
     * the two facts that separate "the intruder we are cutting off" from "a
     * colleague's second laptop", and they are the same pair the executor writes to
     * the log when the revocation finally happens.
     */
    private String describeSession(ActiveSession session) {
        String account = session.getUsername() == null ? "unknown account" : session.getUsername();
        String origin = session.getIpAddress() == null ? "an unknown address" : session.getIpAddress();
        return account + " from " + origin;
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

    /**
     * Requests that an IP block be lifted. Does not lift it.
     *
     * <p>Every other gated act takes something away, and this one gives something
     * back, which is what makes it the easiest of them to under-rate. The block is
     * the control that stopped an intrusion, so lifting it is the one step an
     * attacker who has reached this console needs in order to restore their own
     * access, and it is also the step least likely to look alarming afterwards: the
     * console shows an address leaving a list, no record is destroyed, and the
     * traffic that resumes is indistinguishable from traffic that was never blocked.
     * A wrong unblock is therefore not discovered as a mistake, it is discovered as
     * the next incident, and by then the evidence of how the attacker got back in
     * has scrolled past. One reviewer reading the original block reason costs a
     * minute and is the only cheap moment to catch it.
     *
     * <p>The same {@code DELETE} on the same path returns the same envelope with the
     * same {@code 200}, so the security console is unchanged. The address is still
     * blocked when this returns; {@code IpUnblockExecutor} marks the block UNBLOCKED
     * after {@link SensitiveAction#IP_UNBLOCK} is approved, and it finds that block
     * by the address recorded here rather than by a row id.
     */
    @DeleteMapping("/blocked-ips/{ipAddress}")
    @Operation(summary = "Request that an IP address be unblocked (requires approval; unblocks nothing)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> unblockIp(
            @PathVariable String ipAddress,
            @RequestBody(required = false) Map<String, Object> body,
            @RequestParam(required = false) String reason,
            @AuthenticationPrincipal UserDetails userDetails) {
        // Resolved before the request is raised, for two reasons. A mistyped address
        // fails here with a message the requester can act on instead of three days
        // later, and an address that carries no live block is already in the state
        // being asked for, so raising an approval for it would spend a signature on
        // nothing.
        BlockedIp blocked = blockedIpRepository.findByIpAddressAndStatus(ipAddress, "ACTIVE")
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "IP " + ipAddress + " has no active block, so unblocking it cannot be requested."));

        GovernedActionGateway.Raised raised = governedActions.raise(
                SensitiveAction.IP_UNBLOCK, "BlockedIp", ipAddress,
                describeBlockedIp(blocked), body, reason, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(raised.dto(), raised.message()));
    }

    /**
     * A label an approver can decide on without opening the block list.
     *
     * <p>The address identifies the block on its own, but it does not say what the
     * block was for, and that is the whole of the decision: an address blocked for
     * credential stuffing and an address blocked by a misconfigured health check
     * read identically as four numbers. The original reason is carried along so the
     * approver has it in front of them.
     */
    private String describeBlockedIp(BlockedIp blocked) {
        String why = blocked.getReason() == null ? "no reason recorded" : blocked.getReason();
        if (why.length() > REASON_LABEL_LIMIT) {
            why = why.substring(0, REASON_LABEL_LIMIT) + "...";
        }
        return blocked.getIpAddress() + " (blocked for: " + why + ")";
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

    /**
     * The authenticated caller as a domain user, resolved the same way every other
     * controller in this codebase resolves it.
     *
     * <p>An approval has to name the person who asked for it, so the gate refuses a
     * null requester rather than recording an anonymous request.
     */
    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) return null;
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }
}
