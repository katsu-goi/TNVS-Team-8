package com.photonicomega.facilities.security;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks authenticated STOMP sessions keyed by their session id.
 *
 * <p>Spring carries the {@link java.security.Principal} on the CONNECT frame
 * but does not reliably propagate it onto later SUBSCRIBE frames, so a
 * subscription-authorization interceptor cannot always read the user from
 * {@code accessor.getUser()}. This registry, populated on CONNECT and cleaned
 * on DISCONNECT, lets the subscription interceptor look up the authenticated
 * principal for the current session id instead.
 */
@Component
public class StompSessionRegistry {

    private final Map<String, Authentication> sessions = new ConcurrentHashMap<>();

    public void register(String sessionId, Authentication authentication) {
        if (sessionId != null && authentication != null) {
            sessions.put(sessionId, authentication);
        }
    }

    public void unregister(String sessionId) {
        if (sessionId != null) {
            sessions.remove(sessionId);
        }
    }

    public Authentication get(String sessionId) {
        return sessionId != null ? sessions.get(sessionId) : null;
    }
}