package com.photonicomega.facilities.notification;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Delivers notifications over STOMP. Delivery is best-effort and never throws:
 * failures are logged and the database remains the source of truth (the polling
 * fallback in the UI reconciles anything missed).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RealtimeNotificationPublisher {

    private static final String USER_NOTIFICATIONS = "/queue/notifications";
    private static final String ADMIN_NOTIFICATIONS = "/queue/admin-notifications";

    private final SimpMessagingTemplate messagingTemplate;

    public void publishToUser(String email, Object payload) {
        if (email == null) {
            return;
        }
        try {
            messagingTemplate.convertAndSendToUser(email, USER_NOTIFICATIONS, payload);
            log.debug("Realtime notification published for user {}", email);
        } catch (Exception e) {
            log.warn("Realtime notification delivery failed for user {}: {}", email, e.getMessage());
        }
    }

    public void publishToAdmin(String email, Object payload) {
        if (email == null) {
            return;
        }
        try {
            messagingTemplate.convertAndSendToUser(email, ADMIN_NOTIFICATIONS, payload);
            log.debug("Realtime admin notification published for user {}", email);
        } catch (Exception e) {
            log.warn("Realtime admin notification delivery failed for user {}: {}", email, e.getMessage());
        }
    }
}