package com.photonicomega.facilities.module.security.service;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.security.domain.ActiveSession;
import com.photonicomega.facilities.module.security.repository.ActiveSessionRepository;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserActivityService {

    private final ActiveSessionRepository activeSessionRepository;
    private final UserRepository userRepository;
    private final SupabaseRealtimePublisher supabaseRealtimePublisher;

    @Data
    @Builder
    public static class UserActivityEvent {
        private String type; // USER_ONLINE, USER_ACTIVE, USER_OFFLINE
        private String userId;
        private String username;
        private String fullName;
        private String email;
        private String role;
        private String action;
        private String ip;
        private String device;
        private String browser;
        private long timestamp;
    }

    @Transactional
    public ActiveSession registerSession(User user, String ip, String userAgent) {
        ActiveSession session = upsert(user, ip, userAgent);
        emitEvent(UserActivityEvent.builder()
                .type("USER_ONLINE")
                .userId(user.getId().toString())
                .username(user.getEmail())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .role(firstRole(user))
                .action("Signed in")
                .ip(session.getIpAddress())
                .device(session.getDeviceName())
                .browser(session.getBrowser())
                .timestamp(Instant.now().toEpochMilli())
                .build());
        return session;
    }

    @Transactional
    public void heartbeat(String username, String ip, String userAgent) {
        User user = userRepository.findByEmailAndDeletedFalse(username).orElse(null);
        if (user == null) {
            return;
        }
        upsert(user, ip, userAgent);
    }

    @org.springframework.scheduling.annotation.Scheduled(fixedRate = 60000)
    @Transactional
    public void reapStaleSessions() {
        java.time.Instant cutoff = java.time.Instant.now().minusSeconds(300);
        java.util.List<ActiveSession> active = activeSessionRepository.findByStatus("ACTIVE");
        for (ActiveSession s : active) {
            if (s.getLastActivity() == null || s.getLastActivity().isBefore(cutoff)) {
                s.setStatus("EXPIRED");
                activeSessionRepository.save(s);
                emitEvent(UserActivityEvent.builder()
                        .type("USER_OFFLINE")
                        .userId(s.getUserId())
                        .username(s.getUsername())
                        .fullName(s.getFullName())
                        .email(s.getUsername())
                        .role(s.getRole() != null ? s.getRole() : "EMPLOYEE")
                        .action("Session expired")
                        .ip(s.getIpAddress())
                        .device(s.getDeviceName())
                        .browser(s.getBrowser())
                        .timestamp(Instant.now().toEpochMilli())
                        .build());
            }
        }
    }

    @Transactional
    public void markOffline(User user) {
        if (user == null) {
            return;
        }
        List<ActiveSession> sessions = activeSessionRepository.findByUserIdAndStatus(user.getId().toString(), "ACTIVE");
        for (ActiveSession session : sessions) {
            session.setStatus("REVOKED");
            activeSessionRepository.save(session);
        }
        emitEvent(UserActivityEvent.builder()
                .type("USER_OFFLINE")
                .userId(user.getId().toString())
                .username(user.getEmail())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .role(firstRole(user))
                .action("Signed out")
                .ip("")
                .device("")
                .browser("")
                .timestamp(Instant.now().toEpochMilli())
                .build());
    }

    private ActiveSession upsert(User user, String ip, String userAgent) {
        String[] agent = parseUserAgent(userAgent);
        ActiveSession session = claimActiveSession(user)
                .orElseGet(() -> ActiveSession.builder()
                        .sessionId(UUID.randomUUID().toString())
                        .userId(user.getId().toString())
                        .username(user.getEmail())
                        .fullName(user.getFullName())
                        .role(firstRole(user))
                        .ipAddress(ip != null ? ip : "unknown")
                        .browser(agent[0])
                        .deviceName(agent[1])
                        .loginTime(Instant.now())
                        .status("ACTIVE")
                        .build());
        session.setFullName(user.getFullName());
        session.setRole(firstRole(user));
        session.setIpAddress(ip != null ? ip : session.getIpAddress());
        session.setBrowser(agent[0]);
        session.setDeviceName(agent[1]);
        session.setLastActivity(Instant.now());
        return activeSessionRepository.save(session);
    }

    /**
     * Returns the one ACTIVE session for this user, retiring any others it finds first.
     *
     * <p>There is meant to be at most one, and the read below used to say so by returning
     * an {@code Optional}. Nothing enforced it. This method is reached from a login and
     * from a heartbeat, both of which check-then-insert with no lock, so two requests that
     * both saw no ACTIVE row both created one - twenty-four milliseconds apart, in the case
     * that prompted this. From then on the read threw
     * {@code IncorrectResultSizeDataAccessException} and {@code POST /v1/auth/heartbeat}
     * answered 500 on every beat, for that user, until {@link #reapStaleSessions} expired
     * a row minutes later.
     *
     * <p>Tolerating the duplicate is not sufficient, which is why this collapses rather
     * than merely picking one: a surplus ACTIVE row is counted among the online users and
     * shown on the security dashboards, and it will be picked up by every later read of
     * this table. The newest row is kept because that is the session the user is on. The
     * losers are marked EXPIRED - the same terminal status the reaper uses, so they leave
     * the ACTIVE set exactly the way an ordinary timeout would, and the session history
     * this table exists to hold is preserved rather than deleted.
     *
     * <p>No USER_OFFLINE event is emitted for a collapsed row. The user is not going
     * offline; a bookkeeping duplicate is being reconciled, and announcing it would make
     * the live online-users view flicker the user out and immediately back in.
     */
    private Optional<ActiveSession> claimActiveSession(User user) {
        List<ActiveSession> active = activeSessionRepository
                .findByUsernameAndStatusOrderByLastActivityDescLoginTimeDesc(user.getEmail(), "ACTIVE");
        if (active.isEmpty()) {
            return Optional.empty();
        }
        ActiveSession keep = active.get(0);
        for (ActiveSession duplicate : active.subList(1, active.size())) {
            log.warn("Collapsing duplicate ACTIVE session {} for {} (keeping {}): two requests "
                            + "created a session row concurrently",
                    duplicate.getSessionId(), user.getEmail(), keep.getSessionId());
            duplicate.setStatus("EXPIRED");
            activeSessionRepository.save(duplicate);
        }
        return Optional.of(keep);
    }

    private String firstRole(User user) {
        return user.getRoles().stream()
                .map(com.photonicomega.facilities.module.auth.domain.Role::getName)
                .findFirst()
                .orElse("EMPLOYEE");
    }

    private String[] parseUserAgent(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return new String[]{"Unknown", "Web App"};
        }
        String ua = userAgent;
        String browser = "Unknown";
        if (ua.contains("Edg/")) browser = "Edge";
        else if (ua.contains("Chrome/")) browser = "Chrome";
        else if (ua.contains("Firefox/")) browser = "Firefox";
        else if (ua.contains("Safari/")) browser = "Safari";
        else if (ua.contains("MSIE") || ua.contains("Trident/")) browser = "IE";

        String device = "Desktop";
        if (ua.contains("iPhone")) device = "iPhone";
        else if (ua.contains("iPad")) device = "iPad";
        else if (ua.contains("Android")) device = "Android";
        else if (ua.contains("Mobile")) device = "Mobile";

        return new String[]{browser, device};
    }

    private void emitEvent(UserActivityEvent event) {
        Map<String, Object> row = new HashMap<>();
        row.put("event_type", event.getType());
        row.put("user_id", event.getUserId());
        row.put("username", event.getUsername());
        row.put("full_name", event.getFullName());
        row.put("email", event.getEmail());
        row.put("role", event.getRole());
        row.put("action", event.getAction());
        row.put("ip", event.getIp());
        row.put("device", event.getDevice());
        row.put("browser", event.getBrowser());
        supabaseRealtimePublisher.insertActivityEvent(row);
    }
}
