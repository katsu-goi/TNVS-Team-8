package com.photonicomega.facilities.module.security.service;

import com.photonicomega.facilities.module.security.domain.BlockedIp;
import com.photonicomega.facilities.module.security.domain.LoginHistory;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.domain.ActiveSession;
import com.photonicomega.facilities.module.security.dto.*;
import com.photonicomega.facilities.module.security.repository.ActiveSessionRepository;
import com.photonicomega.facilities.module.security.repository.BlockedIpRepository;
import com.photonicomega.facilities.module.security.repository.LoginHistoryRepository;
import com.photonicomega.facilities.module.security.repository.SecurityLogRepository;
import com.photonicomega.facilities.module.security.service.geo.IpGeo;
import com.photonicomega.facilities.module.security.service.geo.IpGeolocationService;
import com.photonicomega.facilities.module.security.util.IpMask;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Aggregates real security data into geographic IP threat vectors.
 *
 * <p>Only existing tables are used - no new tables. Every threat vector is
 * classified deterministically from {@code security_logs},
 * {@code login_history} and {@code blocked_ips}; trusted (green) markers come
 * from {@code active_sessions} and never inflate the threat-IP count. All IPs
 * returned to the frontend are masked via {@link IpMask}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SecurityThreatMapService {

    private static final int RECENT_LOG_LIMIT = 20;

    private final SecurityLogRepository securityLogRepository;
    private final LoginHistoryRepository loginHistoryRepository;
    private final BlockedIpRepository blockedIpRepository;
    private final ActiveSessionRepository activeSessionRepository;
    private final IpGeolocationService ipGeolocationService;

    /** Priority used to pick the primary (marker) threat type. */
    private static final Map<ThreatType, Integer> THREAT_PRIORITY = Map.of(
            ThreatType.BLOCKED_IP, 7,
            ThreatType.ACCOUNT_LOCKED, 6,
            ThreatType.SQL_INJECTION, 5,
            ThreatType.XSS, 4,
            ThreatType.PORT_SCAN, 3,
            ThreatType.RATE_LIMIT, 2,
            ThreatType.FAILED_LOGIN, 1
    );

    /**
     * Builds the full threat map for the given window.
     */
    public ThreatMapResponse buildMap(ThreatWindow window) {
        Instant now = Instant.now();
        Instant from = now.minus(window.getDuration());

        List<SecurityLog> securityLogs = securityLogRepository.findByTimestampBetween(from, now);
        List<LoginHistory> logins = loginHistoryRepository.findByTimestampBetween(from, now);
        List<BlockedIp> blocked = blockedIpRepository.findByStatus("ACTIVE");
        List<ActiveSession> sessions = activeSessionRepository.findByStatus("ACTIVE");

        Map<String, IpAggregate> aggregates = aggregate(securityLogs, logins, blocked, from);

        List<IpThreatEntry> threats = aggregates.values().stream()
                .map(this::toThreatEntry)
                .sorted(Comparator.comparing(IpThreatEntry::firstSeen).reversed())
                .toList();

        List<TrustedSessionEntry> trustedSessions = sessions.stream()
                .map(this::toTrustedSessionEntry)
                .sorted(Comparator.comparing(TrustedSessionEntry::lastActivity).reversed())
                .toList();

        ThreatMapStats stats = buildStats(aggregates, threats, blocked, sessions, from, now);

        List<GatewayLogEntry> recentLogs = securityLogRepository
                .findAll(PageRequest.of(0, RECENT_LOG_LIMIT, Sort.by(Sort.Direction.DESC, "timestamp")))
                .stream()
                .map(this::toGatewayLogEntry)
                .toList();

        return new ThreatMapResponse(window.getCode(), now, threats, trustedSessions, stats, recentLogs);
    }

    /**
     * Builds only the summary statistics for the given window.
     */
    public ThreatMapStats buildStats(ThreatWindow window) {
        Instant now = Instant.now();
        Instant from = now.minus(window.getDuration());

        List<SecurityLog> securityLogs = securityLogRepository.findByTimestampBetween(from, now);
        List<LoginHistory> logins = loginHistoryRepository.findByTimestampBetween(from, now);
        List<BlockedIp> blocked = blockedIpRepository.findByStatus("ACTIVE");
        List<ActiveSession> sessions = activeSessionRepository.findByStatus("ACTIVE");

        Map<String, IpAggregate> aggregates = aggregate(securityLogs, logins, blocked, from);
        List<IpThreatEntry> threats = aggregates.values().stream()
                .map(this::toThreatEntry)
                .toList();

        return buildStats(aggregates, threats, blocked, sessions, from, now);
    }

    /** Maps a single security log to a gateway feed entry (used by REST + STOMP). */
    public GatewayLogEntry toGatewayLogEntry(SecurityLog log) {
        return new GatewayLogEntry(
                log.getTimestamp(),
                log.getAction(),
                IpMask.maskIp(log.getIpAddress()),
                log.getRiskLevel() != null ? log.getRiskLevel().name() : RiskLevel.LOW.name(),
                log.getModule() != null ? log.getModule().name() : "API_GATEWAY",
                log.getStatus(),
                log.getReason());
    }

    /** Resolves geo coordinates for an IP (cached, fail-open). */
    public Optional<IpGeo> resolveGeo(String ip) {
        return ipGeolocationService.geolocate(ip);
    }

    /**
     * Finds the threat vector for a specific raw IP within an already-built
     * map, used by the broadcast service to attach the affected threat to an
     * EVENT message without rebuilding the whole map per event.
     */
    public Optional<IpThreatEntry> buildThreatForIp(String rawIp, ThreatMapResponse map) {
        if (rawIp == null || rawIp.isBlank()) {
            return Optional.empty();
        }
        String masked = IpMask.maskIp(rawIp);
        return map.threats().stream()
                .filter(t -> masked.equals(t.ip()))
                .findFirst();
    }

    // ---------------------------------------------------------------------
    // Aggregation
    // ---------------------------------------------------------------------

    private Map<String, IpAggregate> aggregate(
            List<SecurityLog> securityLogs,
            List<LoginHistory> logins,
            List<BlockedIp> blocked,
            Instant windowFrom) {
        Map<String, IpAggregate> byIp = new LinkedHashMap<>();

        for (SecurityLog log : securityLogs) {
            ThreatType type = classifySecurityLog(log);
            if (type == null || log.getIpAddress() == null || log.getIpAddress().isBlank()) {
                continue;
            }
            IpAggregate agg = byIp.computeIfAbsent(log.getIpAddress(), IpAggregate::new);
            agg.addEvent(type, log.getRiskLevel(), log.getTimestamp(), "security_logs");
        }

        for (LoginHistory login : logins) {
            ThreatType type = classifyLogin(login);
            if (type == null || login.getIpAddress() == null || login.getIpAddress().isBlank()) {
                continue;
            }
            RiskLevel severity = type == ThreatType.ACCOUNT_LOCKED ? RiskLevel.HIGH : RiskLevel.MEDIUM;
            IpAggregate agg = byIp.computeIfAbsent(login.getIpAddress(), IpAggregate::new);
            agg.addEvent(type, severity, login.getTimestamp(), "login_history");
        }

        for (BlockedIp b : blocked) {
            if (b.getIpAddress() == null || b.getIpAddress().isBlank()) {
                continue;
            }
            IpAggregate agg = byIp.computeIfAbsent(b.getIpAddress(), IpAggregate::new);
            // Persist current-state block regardless of event window.
            agg.markBlocked(b);
        }

        return byIp;
    }

    /** Classifies a {@link SecurityLog} into a {@link ThreatType}, or null when not a threat. */
    private ThreatType classifySecurityLog(SecurityLog log) {
        String action = log.getAction() == null ? "" : log.getAction().toUpperCase(Locale.ROOT);
        String status = log.getStatus() == null ? "" : log.getStatus().toUpperCase(Locale.ROOT);
        String reason = log.getReason() == null ? "" : log.getReason().toUpperCase(Locale.ROOT);

        if (action.contains("SUSPICIOUS_REQUEST_BLOCKED")) {
            if (reason.contains("SQL")) return ThreatType.SQL_INJECTION;
            if (reason.contains("XSS") || reason.contains("SCRIPT")) return ThreatType.XSS;
            if (reason.contains("TRAVERSAL") || reason.contains("SCAN") || reason.contains("COMMAND")) {
                return ThreatType.PORT_SCAN;
            }
            return ThreatType.PORT_SCAN;
        }
        if (action.contains("RATE_LIMIT") || reason.contains("429") || reason.contains("TOO MANY REQUESTS")) {
            return ThreatType.RATE_LIMIT;
        }
        if (status.contains("LOCKED") || action.contains("ACCOUNT_LOCKED") || reason.contains("ACCOUNT_LOCKED")) {
            return ThreatType.ACCOUNT_LOCKED;
        }
        if (status.contains("FAILED") && action.contains("LOGIN")) {
            return ThreatType.FAILED_LOGIN;
        }
        if (reason.contains("INVALID EMAIL OR PASSWORD") || reason.contains("INVALID_CREDENTIALS")
                || reason.contains("ACCOUNT_TEMP_LOCKED")) {
            return ThreatType.FAILED_LOGIN;
        }
        return null;
    }

    /** Classifies a {@link LoginHistory} row, or null when not a threat. */
    private ThreatType classifyLogin(LoginHistory login) {
        if (login.getStatus() == null) {
            return null;
        }
        return switch (login.getStatus().toUpperCase(Locale.ROOT)) {
            case "FAILED" -> ThreatType.FAILED_LOGIN;
            case "LOCKED" -> ThreatType.ACCOUNT_LOCKED;
            default -> null; // SUCCESS / MFA_REQUIRED are not threats
        };
    }

    private IpThreatEntry toThreatEntry(IpAggregate agg) {
        ThreatType primary = agg.primaryThreat();
        RiskLevel severity = agg.blocked
                ? RiskLevel.CRITICAL
                : agg.maxSeverity != null ? agg.maxSeverity : RiskLevel.MEDIUM;

        List<IpThreatEntry.ThreatTypeCount> typeCounts = agg.counts.entrySet().stream()
                .sorted(Map.Entry.<ThreatType, Long>comparingByValue().reversed())
                .map(e -> new IpThreatEntry.ThreatTypeCount(e.getKey(), e.getValue()))
                .toList();

        Optional<IpGeo> geo = resolveGeo(agg.ip);

        return new IpThreatEntry(
                IpMask.maskIp(agg.ip),
                geo.map(IpGeo::country).orElse(null),
                geo.map(IpGeo::city).orElse(null),
                geo.map(IpGeo::latitude).orElse(null),
                geo.map(IpGeo::longitude).orElse(null),
                typeCounts,
                primary,
                severity.name(),
                agg.eventCount,
                agg.blocked ? "BLOCKED" : "DETECTED",
                agg.firstSeen,
                agg.lastSeen,
                String.join(",", agg.sources));
    }

    private TrustedSessionEntry toTrustedSessionEntry(ActiveSession session) {
        Optional<IpGeo> geo = resolveGeo(session.getIpAddress());
        return new TrustedSessionEntry(
                session.getSessionId(),
                session.getUsername(),
                session.getRole(),
                IpMask.maskIp(session.getIpAddress()),
                geo.map(IpGeo::country).orElse(null),
                geo.map(IpGeo::city).orElse(null),
                geo.map(IpGeo::latitude).orElse(null),
                geo.map(IpGeo::longitude).orElse(null),
                session.getLoginTime(),
                session.getLastActivity());
    }

    private ThreatMapStats buildStats(
            Map<String, IpAggregate> aggregates,
            List<IpThreatEntry> threats,
            List<BlockedIp> blocked,
            List<ActiveSession> sessions,
            Instant windowFrom,
            Instant now) {
        Instant dayAgo = now.minus(java.time.Duration.ofHours(24));

        Set<String> countries = threats.stream()
                .map(IpThreatEntry::country)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        long detectedLast24h = threats.stream()
                .filter(t -> t.firstSeen() != null && t.firstSeen().isAfter(dayAgo))
                .count();

        long failedLogins = loginHistoryRepository.countByStatusAndTimestampBetween("FAILED", windowFrom, now);

        return new ThreatMapStats(
                threats.size(),
                detectedLast24h,
                countries.size(),
                blocked.size(),
                sessions.size(),
                failedLogins);
    }

    // ---------------------------------------------------------------------
    // Mutable per-IP aggregation
    // ---------------------------------------------------------------------

    private static final class IpAggregate {
        private final String ip;
        private final EnumMap<ThreatType, Long> counts = new EnumMap<>(ThreatType.class);
        private RiskLevel maxSeverity;
        private Instant firstSeen;
        private Instant lastSeen;
        private long eventCount;
        private boolean blocked;
        private final LinkedHashSet<String> sources = new LinkedHashSet<>();

        private IpAggregate(String ip) {
            this.ip = ip;
        }

        private void addEvent(ThreatType type, RiskLevel severity, Instant timestamp, String source) {
            counts.merge(type, 1L, Long::sum);
            if (severity != null) {
                maxSeverity = max(maxSeverity, severity);
            }
            firstSeen = min(firstSeen, timestamp);
            lastSeen = max(lastSeen, timestamp);
            eventCount++;
            sources.add(source);
        }

        private void markBlocked(BlockedIp block) {
            blocked = true;
            counts.merge(ThreatType.BLOCKED_IP, 1L, Long::sum);
            sources.add("blocked_ips");
            if (block.getBlockedAt() != null) {
                firstSeen = min(firstSeen, block.getBlockedAt());
                lastSeen = max(lastSeen, block.getBlockedAt());
            }
        }

        private ThreatType primaryThreat() {
            return counts.keySet().stream()
                    .max(Comparator.comparingInt(t -> THREAT_PRIORITY.getOrDefault(t, 0)))
                    .orElse(ThreatType.PORT_SCAN);
        }

        private static RiskLevel max(RiskLevel a, RiskLevel b) {
            if (a == null) return b;
            if (b == null) return a;
            return a.ordinal() >= b.ordinal() ? a : b;
        }

        private static Instant min(Instant a, Instant b) {
            if (a == null) return b;
            if (b == null) return a;
            return a.isBefore(b) ? a : b;
        }

        private static Instant max(Instant a, Instant b) {
            if (a == null) return b;
            if (b == null) return a;
            return a.isAfter(b) ? a : b;
        }
    }
}