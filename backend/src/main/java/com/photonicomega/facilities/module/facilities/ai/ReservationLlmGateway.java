package com.photonicomega.facilities.module.facilities.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.photonicomega.facilities.ai.AiStateManagementService;
import com.photonicomega.facilities.ai.ModuleAiConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.List;

/**
 * Optional real-LLM layer. When a configured AI provider (with a real API key)
 * is available, generates human-friendly explanations for room suggestions,
 * reservation validations, drafts, and approval recommendations. Always falls
 * back gracefully when no provider/key is configured or the call fails -
 * the heuristic engine remains the source of truth.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ReservationLlmGateway {

    private final AiStateManagementService aiStateService;
    private final ModuleAiConfigService moduleAiConfigService;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String PLACEHOLDER_KEY = "sk-proj-default";

    /**
     * Returns the enriched explanation or the original text if the LLM is
     * unavailable/unconfigured. When {@code moduleId} is given the per-module
     * assigned provider/model is used.
     */
    public String enrich(String systemInstruction, String userPayload, String fallback) {
        return enrich(systemInstruction, userPayload, fallback, null);
    }

    public String enrich(String systemInstruction, String userPayload, String fallback, String moduleId) {
        ModuleAiConfigService.ExecutionTarget target = resolveTarget(moduleId);
        if (target == null || target.getProviderId() == null) {
            return fallback;
        }
        AiStateManagementService.ProviderDto provider = aiStateService.getProviders().stream()
                .filter(p -> target.getProviderId().equals(p.getId()))
                .findFirst().orElse(null);
        if (provider == null || provider.getApiKey() == null || provider.getApiKey().isBlank()
                || PLACEHOLDER_KEY.equals(provider.getApiKey())) {
            return fallback;
        }

        try {
            String baseUrl = provider.getBaseUrl() != null && !provider.getBaseUrl().isBlank()
                    ? provider.getBaseUrl() : "https://api.openai.com/v1";
            String model = target.getModel() != null && !target.getModel().isBlank()
                    ? target.getModel() : (provider.getModel() != null ? provider.getModel() : "gpt-4o");
            String endpoint = (baseUrl.endsWith("/") ? baseUrl : baseUrl + "/") + "chat/completions";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(provider.getApiKey());
            // Some OpenAI-compatible gateways reject the default Java RestTemplate
            // User-Agent as an "unauthorized client"; present a browser-like UA.
            headers.set(HttpHeaders.USER_AGENT,
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                            + "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");

            ObjectNode body = objectMapper.createObjectNode();
            body.put("model", model);
            body.put("max_tokens", 320);
            body.put("temperature", 0.3);
            ArrayNode messages = body.putArray("messages");
            messages.addObject().put("role", "system").put("content", systemInstruction);
            messages.addObject().put("role", "user").put("content", userPayload);

            JsonNode response = restTemplate.postForObject(
                    endpoint, new HttpEntity<>(body.toString(), headers), JsonNode.class);

            String content = response != null
                    ? response.path("choices").path(0).path("message").path("content").asText(null)
                    : null;
            if (content != null && !content.isBlank()) {
                return content.trim();
            }
        } catch (Exception e) {
            log.debug("LLM enrichment unavailable, using heuristic output: {}", e.getMessage());
        }
        return fallback;
    }

    private ModuleAiConfigService.ExecutionTarget resolveTarget(String moduleId) {
        if (moduleId != null) {
            ModuleAiConfigService.ExecutionTarget target = moduleAiConfigService.resolveExecution(moduleId);
            if (target != null && !target.isDisabled()) {
                return target;
            }
        }
        List<AiStateManagementService.ProviderDto> providers = aiStateService.getProviders();
        AiStateManagementService.ProviderDto provider = providers.stream()
                .filter(p -> Boolean.TRUE.equals(p.isDefault()))
                .findFirst()
                .orElseGet(() -> providers.isEmpty() ? null : providers.get(0));
        if (provider == null) {
            return null;
        }
        return ModuleAiConfigService.ExecutionTarget.builder()
                .providerId(provider.getId())
                .providerName(provider.getName())
                .model(provider.getModel())
                .build();
    }
}
