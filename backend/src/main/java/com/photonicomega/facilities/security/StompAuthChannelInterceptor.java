package com.photonicomega.facilities.security;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * Authenticates STOMP connections with the same JWT used for HTTP requests.
 *
 * <p>The JWT (an access token whose subject is the user's email) is read from
 * the STOMP {@code CONNECT} frame's {@code Authorization} header, validated with
 * {@link JwtTokenProvider}, and attached to the frame as the session's
 * {@link java.security.Principal}. That principal powers user-scoped delivery via
 * {@code convertAndSendToUser(...)} → {@code /user/queue/*}. Connections without a
 * valid token are rejected, so every STOMP session is authenticated.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenProvider jwtTokenProvider;
    private final UserDetailsService userDetailsService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || !StompCommand.CONNECT.equals(accessor.getCommand())) {
            return message;
        }

        String token = extractToken(accessor);
        if (StringUtils.hasText(token) && jwtTokenProvider.validateToken(token)) {
            String email = jwtTokenProvider.extractUsername(token);
            UserDetails userDetails = userDetailsService.loadUserByUsername(email);
            if (jwtTokenProvider.isTokenValid(token, userDetails)) {
                accessor.setUser(new UsernamePasswordAuthenticationToken(email, null, userDetails.getAuthorities()));
                log.debug("STOMP connection authenticated for user {}", email);
                return message;
            }
        }
        log.warn("STOMP connection rejected: missing or invalid JWT");
        throw new AuthenticationCredentialsNotFoundException("Missing or invalid STOMP authentication token");
    }

    private String extractToken(StompHeaderAccessor accessor) {
        List<String> values = accessor.getNativeHeader(AUTHORIZATION_HEADER);
        if (values == null || values.isEmpty() || !StringUtils.hasText(values.get(0))) {
            return null;
        }
        String value = values.get(0).trim();
        if (value.startsWith(BEARER_PREFIX)) {
            return value.substring(BEARER_PREFIX.length());
        }
        return value;
    }
}