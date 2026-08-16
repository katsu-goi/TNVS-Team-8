package com.photonicomega.facilities.notification;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Proves the realtime publisher is best-effort: a broken WebSocket transport
 * must never propagate an exception to the caller (i.e. the business
 * transaction that just persisted the notification must not roll back).
 */
class RealtimeNotificationPublisherTest {

    private final Map<String, Object> payload = new HashMap<>();

    @Test
    @DisplayName("publishToUser swallows transport failures and never throws")
    void publishToUserIsBestEffort() {
        SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
        doThrow(new IllegalStateException("broker down"))
                .when(template).convertAndSendToUser(anyString(), anyString(), any());
        RealtimeNotificationPublisher publisher = new RealtimeNotificationPublisher(template);

        assertThatCode(() -> publisher.publishToUser("employee@photonicomega.com", payload))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("publishToAdmin swallows transport failures and never throws")
    void publishToAdminIsBestEffort() {
        SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
        doThrow(new IllegalStateException("broker down"))
                .when(template).convertAndSendToUser(anyString(), anyString(), any());
        RealtimeNotificationPublisher publisher = new RealtimeNotificationPublisher(template);

        assertThatCode(() -> publisher.publishToAdmin("admin@photonicomega.com", payload))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("a null recipient is a silent no-op, not an error")
    void nullRecipientIsNoOp() {
        SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
        RealtimeNotificationPublisher publisher = new RealtimeNotificationPublisher(template);

        assertThatCode(() -> publisher.publishToUser(null, payload)).doesNotThrowAnyException();
        assertThatCode(() -> publisher.publishToAdmin(null, payload)).doesNotThrowAnyException();
        verify(template, never()).convertAndSendToUser(anyString(), anyString(), any());
    }
}
