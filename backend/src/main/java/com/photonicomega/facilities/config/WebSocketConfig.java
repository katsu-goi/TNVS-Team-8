package com.photonicomega.facilities.config;

import com.photonicomega.facilities.security.StompAuthChannelInterceptor;
import com.photonicomega.facilities.security.StompSubscriptionAuthInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final StompAuthChannelInterceptor stompAuthChannelInterceptor;
    private final StompSubscriptionAuthInterceptor stompSubscriptionAuthInterceptor;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic", "/queue");
        config.setApplicationDestinationPrefixes("/app");
        // User-scoped destinations so convertAndSendToUser(...) maps to /user/{principal}/queue/...
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws-endpoint")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        // 1. Authenticate every STOMP CONNECT frame with the caller's JWT.
        // 2. Enforce role-based access on SUBSCRIBE frames (e.g. /topic/security/threats).
        registration.interceptors(stompAuthChannelInterceptor, stompSubscriptionAuthInterceptor);
    }
}