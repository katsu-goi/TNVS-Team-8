package com.photonicomega.facilities.module.security.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Pushes user-activity events and the online-user list into Supabase
 * via the PostgREST REST API. Supabase Realtime then streams the
 * inserted/upserted rows to subscribed browser clients over WebSocket,
 * replacing the Spring STOMP topics for this feature.
 */
@Service
@Slf4j
public class SupabaseRealtimePublisher {

    private final RestClient restClient;
    private final String baseUrl;
    private final String anonKey;
    private final String activityTable;
    private final String onlineTable;

    public SupabaseRealtimePublisher(
            @Value("${app.supabase.url}") String baseUrl,
            @Value("${app.supabase.anon-key}") String anonKey,
            @Value("${app.supabase.activity-table}") String activityTable,
            @Value("${app.supabase.online-table}") String onlineTable) {
        this.baseUrl = baseUrl;
        this.anonKey = anonKey;
        this.activityTable = activityTable;
        this.onlineTable = onlineTable;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(3000);
        requestFactory.setReadTimeout(5000);
        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .defaultHeader("apikey", anonKey)
                .defaultHeader("Authorization", "Bearer " + anonKey)
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public boolean isConfigured() {
        return baseUrl != null && !baseUrl.isBlank()
                && anonKey != null && !anonKey.isBlank()
                && !anonKey.contains("your-service-key") && !anonKey.contains("your-");
    }

    /** Inserts a single activity event row; broadcast to subscribers via Realtime. */
    public void insertActivityEvent(Map<String, Object> event) {
        if (!isConfigured()) {
            return;
        }
        try {
            restClient.post()
                    .uri(baseUrl + "/rest/v1/" + activityTable)
                    .body(event)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("Supabase insertActivityEvent failed: {}", e.getMessage());
        }
    }

    /**
     * Upserts the current online users (keyed by username) and deletes rows
     * for users who are no longer online.
     */
    public void syncOnlineUsers(List<Map<String, Object>> onlineUsers) {
        if (!isConfigured()) {
            return;
        }
        try {
            if (onlineUsers != null && !onlineUsers.isEmpty()) {
                restClient.post()
                        .uri(uriBuilder -> uriBuilder
                                .path("/rest/v1/{table}")
                                .queryParam("on_conflict", "username")
                                .build(onlineTable))
                        .header("Prefer", "resolution=merge-duplicates,return=minimal")
                        .body(onlineUsers)
                        .retrieve()
                        .toBodilessEntity();
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> existing = restClient.get()
                    .uri(baseUrl + "/rest/v1/" + onlineTable + "?select=username")
                    .retrieve()
                    .body(List.class);

            if (existing == null) {
                return;
            }
            List<String> current = new ArrayList<>();
            if (onlineUsers != null) {
                for (Map<String, Object> u : onlineUsers) {
                    Object username = u.get("username");
                    if (username != null) {
                        current.add(String.valueOf(username));
                    }
                }
            }

            List<String> stale = new ArrayList<>();
            for (Map<String, Object> row : existing) {
                Object username = row.get("username");
                if (username != null && !current.contains(String.valueOf(username))) {
                    stale.add(String.valueOf(username));
                }
            }

            if (!stale.isEmpty()) {
                restClient.delete()
                        .uri(baseUrl + "/rest/v1/" + onlineTable + "?username=in.("
                                + String.join(",", stale) + ")")
                        .retrieve()
                        .toBodilessEntity();
            }
        } catch (Exception e) {
            log.warn("Supabase syncOnlineUsers failed: {}", e.getMessage());
        }
    }
}
