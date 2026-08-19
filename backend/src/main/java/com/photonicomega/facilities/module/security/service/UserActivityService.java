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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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

    @Transactional(propagation = Propagation.REQUIRES_NEW)
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
        List<ActiveSession> activeSessions = activeSessionRepository
                .findByUsernameAndStatusOrderByLastActivityDesc(user.getEmail(), "ACTIVE");

        ActiveSession session;
        if (activeSessions.isEmpty()) {
            String stableSessionId = "user-" + user.getId();
            session = activeSessionRepository.findBySessionId(stableSessionId)
                    .orElseGet(() -> ActiveSession.builder()
                            .sessionId(stableSessionId)
                            .userId(user.getId().toString())
                            .username(user.getEmail())
                            .build());
            session.setLoginTime(Instant.now());
            session.setStatus("ACTIVE");
        } else {
            session = activeSessions.get(0);
            if (activeSessions.size() > 1) {
                List<ActiveSession> duplicates = activeSessions.subList(1, activeSessions.size());
                duplicates.forEach(duplicate -> duplicate.setStatus("REVOKED"));
                activeSessionRepository.saveAll(duplicates);
                log.warn("Consolidated {} duplicate active sessions for {}",
                        duplicates.size(), user.getEmail());
            }
        }
        session.setFullName(user.getFullName());
        session.setRole(firstRole(user));
        session.setIpAddress(ip != null ? ip
                : session.getIpAddress() != null ? session.getIpAddress() : "unknown");
        session.setBrowser(agent[0]);
        session.setDeviceName(agent[1]);
        session.setLastActivity(Instant.now());
        return activeSessionRepository.save(session);
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
