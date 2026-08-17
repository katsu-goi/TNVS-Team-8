package com.photonicomega.facilities.module.security.service;

import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.dto.IpThreatEntry;
import com.photonicomega.facilities.module.security.dto.SecurityThreatEvent;
import com.photonicomega.facilities.module.security.dto.ThreatMapResponse;
import com.photonicomega.facilities.module.security.dto.ThreatWindow;
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
 *   <li><b>EVENT</b> (~every 5s): the most recent security log that maps to a
 *       threat, together with the affected threat vector and current stats.</li>
 *   <li><b>SYNC</b> (~every 30s): a full snapshot of threats, trusted sessions
 *       and stats so a reconnecting client converges quickly.</li>
 * </ul>
 *
 * <p>The 5s tick is cheap: it only replays {@link SecurityLog}s created since
 * the previous tick (timestamp watermark), and broadcasts nothing when there
 * is no new activity. This keeps the stream real (no fabricated events) while
 * satisfying the "EVENT ~5s / SYNC ~30s" cadence.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SecurityThreatBroadcastService {

    public static final String THREAT_TOPIC = "/topic/security/threats";

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

        ThreatMapResponse map = mapService.buildMap(ThreatWindow.HOURS_24);
        for (SecurityLog log : fresh) {
            Optional<IpThreatEntry> threat = mapService.buildThreatForIp(log.getIpAddress(), map);
            SecurityThreatEvent event = new SecurityThreatEvent(
                    SecurityThreatEvent.TYPE_EVENT,
                    threat.orElse(null),
                    mapService.toGatewayLogEntry(log),
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
        ThreatMapResponse map = mapService.buildMap(ThreatWindow.HOURS_24);
        SecurityThreatEvent sync = new SecurityThreatEvent(
                SecurityThreatEvent.TYPE_SYNC,
                null,
                null,
                map.threats(),
                map.trustedSessions(),
                map.stats(),
                Instant.now());
        messagingTemplate.convertAndSend(THREAT_TOPIC, sync);
    }
}