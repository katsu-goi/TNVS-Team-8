package com.photonicomega.facilities.security;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Component;

import java.security.Principal;

/**
 * Enforces role-based access on STOMP subscriptions.
 *
 * <p>Only {@code ROLE_SUPER_ADMIN} principals may subscribe to the security
 * threat map topic. The principal is resolved from the frame's user header
 * when Spring propagated it, falling back to the {@link StompSessionRegistry}
 * (keyed by session id) which is populated during CONNECT authentication.
 *
 * <p>A denied subscription throws {@link AccessDeniedException}, which the
 * STOMP stack turns into an {@code ERROR} frame sent back to the client; the
 * subscription is not registered, so no further frames are delivered.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class StompSubscriptionAuthInterceptor implements ChannelInterceptor {

    public static final String SECURITY_THREAT_TOPIC = "/topic/security/threats";

    private final StompSessionRegistry sessionRegistry;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || !StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            return message;
        }

        String destination = accessor.getDestination();
        if (destination == null || !SECURITY_THREAT_TOPIC.equals(destination)) {
            return message;
        }

        Principal principal = accessor.getUser();
        Authentication authentication = toAuthentication(principal);
        if (authentication == null) {
            authentication = sessionRegistry.get(accessor.getSessionId());
        }

        if (!hasSuperAdminRole(authentication)) {
            log.warn("STOMP subscription to {} denied for session {} (principal: {})",
                    SECURITY_THREAT_TOPIC, accessor.getSessionId(), principal != null ? principal.getName() : "anonymous");
            throw new AccessDeniedException(
                    "Forbidden: only SUPER_ADMIN may subscribe to " + SECURITY_THREAT_TOPIC);
        }

        return message;
    }

    private Authentication toAuthentication(Principal principal) {
        return principal instanceof Authentication ? (Authentication) principal : null;
    }

    private boolean hasSuperAdminRole(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return false;
        }
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(authority -> "ROLE_SUPER_ADMIN".equals(authority));
    }
}