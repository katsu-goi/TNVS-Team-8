package com.photonicomega.facilities.module.admin.service;

import com.photonicomega.facilities.module.admin.domain.AdminNotification;
import com.photonicomega.facilities.module.admin.repository.AdminNotificationRepository;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.notification.RealtimeNotificationPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Creates per-admin notifications for real system events (e.g. HIGH-severity
 * security alerts, AI provider outages). Each SUPER_ADMIN receives their own
 * row so read state is per-admin; delivery is pushed to each admin's realtime
 * queue as well as persisted (database stays the source of truth).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AdminNotificationService {

    private final AdminNotificationRepository adminNotificationRepository;
    private final UserRepository userRepository;
    private final RealtimeNotificationPublisher realtimeNotificationPublisher;

    @Transactional
    public void notifyAdmins(String type, String severity, String title, String message,
                             String entityType, String entityId) {
        List<User> admins = userRepository.findByRoleName("SUPER_ADMIN");
        if (admins.isEmpty()) {
            log.info("No SUPER_ADMIN users to notify for admin notification '{}'", title);
            return;
        }
        for (User admin : admins) {
            AdminNotification saved = adminNotificationRepository.save(AdminNotification.builder()
                    .recipient(admin)
                    .title(title)
                    .message(message)
                    .type(type)
                    .severity(severity)
                    .relatedEntityType(entityType)
                    .relatedEntityId(entityId)
                    .read(false)
                    .createdAt(Instant.now())
                    .build());
            log.info("Admin notification created: type={} severity={} recipient={} title={}",
                    type, severity, admin.getId(), title);
            realtimeNotificationPublisher.publishToAdmin(admin.getEmail(), toDto(saved));
        }
    }

    private Map<String, Object> toDto(AdminNotification n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", n.getId());
        m.put("title", n.getTitle());
        m.put("message", n.getMessage());
        m.put("type", n.getType());
        m.put("severity", n.getSeverity());
        m.put("read", n.isRead());
        m.put("relatedEntityType", n.getRelatedEntityType());
        m.put("relatedEntityId", n.getRelatedEntityId());
        m.put("createdAt", n.getCreatedAt());
        return m;
    }
}