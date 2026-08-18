package com.photonicomega.facilities.module.security.service;

import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.dto.IpThreatEntry;
import com.photonicomega.facilities.module.security.dto.SecurityThreatEvent;
import com.photonicomega.facilities.module.security.dto.ThreatMapResponse;
import com.photonicomega.facilities.module.security.dto.ThreatWindow;
import com.photonicomega.facilities.module.security.dto.TrustedSessionEntry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Streams the geographic IP threat map to {@code /topic/security/threats}.
 *
 * <p>Two message shapes are published:
 * <ul>
 *   <li><b>EVENT</b> (~every 5s): the most recent security log, together with
 *       the affected threat vector, an optional {@code trustedSession} for a
 *       successful login, and current stats. Every EVENT carries the
 *       {@code window} it was aggregated with so the client can ignore
 *       mismatched data.</li>
 *   <li><b>SYNC</b> (~every 30s): a full snapshot of threats, trusted sessions
 *       and stats (with its {@code window}) so a reconnecting client converges
 *       quickly.</li>
 * </ul>
 *
 * <p>The 5s tick is cheap: it only replays {@link SecurityLog}s created since
 * the previous tick (timestamp watermark), and broadcasts nothing when there
 * is no new activity. This keeps the stream real (no fabricated events) while
 * satisfying the "EVENT ~5s / SYNC ~30s" cadence.
 *
 * <p>The broadcast window is fixed to {@link ThreatWindow#HOURS_24}; a client
 * that selected a different window keeps its own REST snapshot and discards
 * mismatched broadcast data rather than being overwritten by a 24h view.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SecurityThreatBroadcastService {

    public static final String THREAT_TOPIC = "/topic/security/threats";

    /** The window the real-time broadcast aggregates against. */
    public static final ThreatWindow BROADCAST_WINDOW = ThreatWindow.HOURS_24;

    private final SimpMessagingTemplate messagingTemplate;
    private final SecurityThreatMapService mapService;
    private final com.photonicomega.facilities.module.security.repository.SecurityLogRepository securityLogRepository;

    private volatile Instant lastEventWatermark = Instant.now();

    @Scheduled(fixedDelay = 5000, initialDelay = 10000)
    public void broadcastEvents() {
        Instant now = Instant.now();
        Instant since = lastEventWatermark;
        List<SecurityLog> fresh = securityLogRepository.findByTimestampBetween(since, now);
        if (fresh.isEmpty()) {
            lastEventWatermark = now;
            return;
        }

        ThreatMapResponse map = mapService.buildMap(BROADCAST_WINDOW);
        for (SecurityLog log : fresh) {
            Optional<IpThreatEntry> threat = mapService.buildThreatForIp(log.getIpAddress(), map);

            // Persist geolocation onto the row (idempotent) so logs carry geo.
            mapService.writeBackGeo(log);

            // For a successful login, attach the trusted session so the green
            // marker appears immediately instead of waiting for the next SYNC.
            Optional<TrustedSessionEntry> trusted = isSuccessfulLogin(log)
                    ? mapService.buildTrustedSessionForLog(log)
                    : Optional.empty();

            SecurityThreatEvent event = new SecurityThreatEvent(
                    SecurityThreatEvent.TYPE_EVENT,
                    BROADCAST_WINDOW.getCode(),
                    threat.orElse(null),
                    mapService.toGatewayLogEntry(log),
                    trusted.orElse(null),
                    null,
                    null,
                    map.stats(),
                    now);
            messagingTemplate.convertAndSend(THREAT_TOPIC, event);
        }
        lastEventWatermark = now;
    }

    @Scheduled(fixedDelay = 30000, initialDelay = 30000)
    public void broadcastSync() {
        ThreatMapResponse map = mapService.buildMap(BROADCAST_WINDOW);
        SecurityThreatEvent sync = new SecurityThreatEvent(
                SecurityThreatEvent.TYPE_SYNC,
                BROADCAST_WINDOW.getCode(),
                null,
                null,
                null,
                map.threats(),
                map.trustedSessions(),
                map.stats(),
                Instant.now());
        messagingTemplate.convertAndSend(THREAT_TOPIC, sync);
    }

    /**
     * Publishes an immediate EVENT for a caller-supplied security log (used by
     * the admin test-event endpoint) without disturbing the watermark.
     */
    public void broadcastTestEvent(SecurityLog log) {
        ThreatMapResponse map = mapService.buildMap(BROADCAST_WINDOW);
        mapService.writeBackGeo(log);
        Optional<IpThreatEntry> threat = mapService.buildThreatForIp(log.getIpAddress(), map);
        SecurityThreatEvent event = new SecurityThreatEvent(
                SecurityThreatEvent.TYPE_EVENT,
                BROADCAST_WINDOW.getCode(),
                threat.orElse(null),
                mapService.toGatewayLogEntry(log),
                null,
                null,
                null,
                map.stats(),
                Instant.now());
        messagingTemplate.convertAndSend(THREAT_TOPIC, event);
    }

    private boolean isSuccessfulLogin(SecurityLog log) {
        if (log == null || log.getAction() == null) {
            return false;
        }
        String action = log.getAction().toUpperCase(java.util.Locale.ROOT);
        String status = log.getStatus() == null ? "" : log.getStatus().toUpperCase(java.util.Locale.ROOT);
        return action.contains("LOGIN") && !status.equals("FAILED");
    }
}
