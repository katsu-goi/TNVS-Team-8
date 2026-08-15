package com.photonicomega.facilities.ai;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Fetches the available models from a configured AI provider using the same
 * provider-specific endpoints the AI Services page uses (OpenAI-compatible
 * /v1/models, Gemini, Anthropic, Azure). Shared by the model-catalog endpoints
 * and per-module model resolution so the whole system speaks to providers the
 * same way.
 */
@Component
@Slf4j
public class ModelFetcher {

    private final RestTemplate restTemplate = new RestTemplate();

    public List<String> fetch(AiStateManagementService.ProviderDto provider) {
        if (provider == null) {
            return List.of();
        }
        String type = provider.getType() != null ? provider.getType().toLowerCase() : "openai";
        return switch (type) {
            case "gemini" -> fetchGeminiModels(provider.getApiKey());
            case "claude", "anthropic" -> fetchAnthropicModels(provider.getApiKey());
            case "azure" -> fetchAzureModels(provider.getApiKey(), provider.getBaseUrl(), provider.getEndpoint());
            default -> fetchOpenAiCompatibleModels(provider.getApiKey(), provider.getBaseUrl());
        };
    }

    public List<String> fetch(String type, String apiKey, String baseUrl, String endpoint) {
        String t = type != null ? type.toLowerCase() : "openai";
        return switch (t) {
            case "gemini" -> fetchGeminiModels(apiKey);
            case "claude", "anthropic" -> fetchAnthropicModels(apiKey);
            case "azure" -> fetchAzureModels(apiKey, baseUrl, endpoint);
            default -> fetchOpenAiCompatibleModels(apiKey, baseUrl);
        };
    }

    private HttpHeaders baseProviderHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set(HttpHeaders.USER_AGENT,
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        + "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        return headers;
    }

    private List<String> fetchOpenAiCompatibleModels(String apiKey, String baseUrl) {
        String cleanBase = (baseUrl == null || baseUrl.isBlank())
                ? "https://api.openai.com"
                : baseUrl.replaceAll("/+$", "");
        String modelsUrl = cleanBase.contains("/v1")
                ? cleanBase.replaceAll("/v1.*", "") + "/v1/models"
                : cleanBase + "/v1/models";

        HttpHeaders headers = baseProviderHeaders();
        if (apiKey != null && !apiKey.isBlank()) {
            headers.setBearerAuth(apiKey);
        }
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        Map<?, ?> body = restTemplate.exchange(modelsUrl, HttpMethod.GET, entity, Map.class).getBody();
        return extractIds(body, "data", "id");
    }

    private List<String> fetchGeminiModels(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("API Key is required for Google Gemini");
        }
        String url = "https://generativelanguage.googleapis.com/v1beta/models?key="
                + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);
        HttpHeaders headers = baseProviderHeaders();
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        Map<?, ?> body = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class).getBody();

        List<String> models = new ArrayList<>();
        if (body != null && body.get("models") instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m && m.get("name") != null) {
                    models.add(m.get("name").toString().replaceFirst("^models/", ""));
                }
            }
        }
        models.sort(String.CASE_INSENSITIVE_ORDER);
        return models;
    }

    private List<String> fetchAnthropicModels(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("API Key is required for Anthropic Claude");
        }
        HttpHeaders headers = baseProviderHeaders();
        headers.set("x-api-key", apiKey);
        headers.set("anthropic-version", "2023-06-01");
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        Map<?, ?> body = restTemplate.exchange("https://api.anthropic.com/v1/models",
                HttpMethod.GET, entity, Map.class).getBody();
        return extractIds(body, "data", "id");
    }

    private List<String> fetchAzureModels(String apiKey, String baseUrl, String endpoint) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("API Key is required for Azure OpenAI");
        }
        String apiVersion = "2024-02-15-preview";
        if (endpoint != null && endpoint.contains("api-version=")) {
            String extracted = endpoint.substring(endpoint.indexOf("api-version=") + "api-version=".length());
            int amp = extracted.indexOf('&');
            if (amp > 0) {
                extracted = extracted.substring(0, amp);
            }
            if (!extracted.isBlank()) {
                apiVersion = extracted;
            }
        }
        String base = (baseUrl == null || baseUrl.isBlank())
                ? "https://your-resource.openai.azure.com"
                : baseUrl.replaceAll("/+$", "");

        HttpHeaders headers = baseProviderHeaders();
        headers.set("api-key", apiKey);
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        Map<?, ?> body = restTemplate.exchange(
                base + "/openai/models?api-version=" + apiVersion,
                HttpMethod.GET, entity, Map.class).getBody();
        return extractIds(body, "data", "id");
    }

    private List<String> extractIds(Map<?, ?> body, String arrayKey, String idKey) {
        List<String> ids = new ArrayList<>();
        if (body != null && body.get(arrayKey) instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m && m.get(idKey) != null) {
                    ids.add(m.get(idKey).toString());
                }
            }
        }
        ids.sort(String.CASE_INSENSITIVE_ORDER);
        return ids;
    }
}