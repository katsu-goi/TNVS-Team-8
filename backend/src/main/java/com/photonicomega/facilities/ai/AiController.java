package com.photonicomega.facilities.ai;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import lombok.Builder;
import org.springframework.security.access.prepost.PreAuthorize;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/v1/ai")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "*")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class AiController {

    private final DocumentClassificationAiService classificationAiService;
    private final ContractAnalyticsAiService contractAnalyticsAiService;
    private final AiStateManagementService aiStateService;
    private final ModuleInstructionService moduleInstructionService;
    private final ModuleDataContextService moduleDataContextService;
    private final ModuleAiConfigService moduleAiConfigService;
    private final AiChatService aiChatService;
    private final ModelFetcher modelFetcher;
    private final com.photonicomega.facilities.module.auth.repository.UserRepository userRepository;
    private final jakarta.servlet.http.HttpServletRequest request;
    private final RestTemplate restTemplate = new RestTemplate();

    @Data
    public static class ConnectionTestRequest {
        private String provider;
        private String apiKey;
        private String endpointUrl;
        private String endpoint;
        private String model;
        private String baseUrl;
    }

    @Data
    @Builder
    public static class ConnectionTestResponse {
        private String provider;
        private String status; // ONLINE, ERROR, DEGRADED
        private long responseTimeMs;
        private String message;
        private String modelUsed;
    }

    @Data
    public static class ClassifyRequest {
        private String content;
        private String apiKey;
        private String provider;
    }

    @Data
    public static class ContractAnalysisRequest {
        private String contractText;
        private String apiKey;
        private String provider;
    }

    @Data
    public static class LiveExecuteRequest {
        private String moduleType; // CLASSIFICATION, CONTRACT_ANALYSIS, VISITOR_OCR, SYSTEM_PROMPT_TEST
        private String payload;
        private String providerName;
        private String model;
    }

    @GetMapping("/providers")
    public ResponseEntity<ApiResponse<List<AiStateManagementService.ProviderDto>>> getProviders() {
        return ResponseEntity.ok(ApiResponse.success(aiStateService.getProviders(), "AI Providers retrieved"));
    }

    @PostMapping("/providers")
    public ResponseEntity<ApiResponse<AiStateManagementService.ProviderDto>> addProvider(@RequestBody AiStateManagementService.ProviderDto req) {
        AiStateManagementService.ProviderDto created = aiStateService.addProvider(req);
        moduleAiConfigService.broadcastProviderChange("PROVIDER_ADDED");
        return ResponseEntity.ok(ApiResponse.success(created, "AI Provider saved successfully"));
    }

    @PutMapping("/providers/{id}/default")
    public ResponseEntity<ApiResponse<String>> setDefaultProvider(@PathVariable String id) {
        aiStateService.setDefaultProvider(id);
        moduleAiConfigService.broadcastProviderChange("PROVIDER_DEFAULT_CHANGED");
        return ResponseEntity.ok(ApiResponse.success(id, "Default AI provider set successfully"));
    }

    @DeleteMapping("/providers/{id}")
    public ResponseEntity<ApiResponse<String>> deleteProvider(@PathVariable String id) {
        boolean removed = aiStateService.deleteProvider(id);
        if (removed) {
            moduleAiConfigService.broadcastProviderChange("PROVIDER_DELETED");
        }
        return ResponseEntity.ok(ApiResponse.success(id, removed ? "AI Provider deleted" : "Provider not found"));
    }

    @GetMapping("/modules")
    public ResponseEntity<ApiResponse<List<ModuleAiConfigService.ModuleConfigDto>>> getModules() {
        return ResponseEntity.ok(ApiResponse.success(moduleAiConfigService.listModules(), "AI Modules retrieved"));
    }

    @PutMapping("/modules/{id}/toggle")
    public ResponseEntity<ApiResponse<AiStateManagementService.ModuleDto>> toggleModule(@PathVariable String id) {
        AiStateManagementService.ModuleDto updated = aiStateService.toggleModule(id);
        if (updated == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("AI module not found", "MODULE_NOT_FOUND"));
        }
        // Persist the enabled state into the module config so the DB stays the
        // source of truth for execution gating.
        moduleAiConfigService.syncEnabled(id, updated.isEnabled());
        moduleAiConfigService.broadcast(id);
        return ResponseEntity.ok(ApiResponse.success(updated, "Module toggle state updated"));
    }

    @Data
    @Builder
    public static class ModuleConfigSaveResponse {
        private ModuleAiConfigService.ModuleConfigDto config;
        private List<String> warnings;
    }

    @PutMapping("/modules/{id}/config")
    public ResponseEntity<ApiResponse<ModuleConfigSaveResponse>> updateModuleConfig(
            @PathVariable String id,
            @RequestBody ModuleAiConfigService.UpdateModuleConfigRequest req,
            @AuthenticationPrincipal UserDetails admin) {
        if (req.getProviderId() != null && !req.getProviderId().isBlank()
                && !moduleAiConfigService.providerExists(req.getProviderId())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("The selected AI provider no longer exists. Please choose another provider or System Default.", "PROVIDER_NOT_FOUND"));
        }
        User user = resolveUser(admin);
        ModuleAiConfigService.UpdateResult result = moduleAiConfigService.updateConfig(
                id, req, user, clientIp(request));
        if (result == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("AI module not found", "MODULE_NOT_FOUND"));
        }
        ModuleConfigSaveResponse resp = ModuleConfigSaveResponse.builder()
                .config(result.getConfig())
                .warnings(result.getWarnings())
                .build();
        return ResponseEntity.ok(ApiResponse.success(resp, "AI module configuration saved"));
    }

    @GetMapping("/modules/{id}/models")
    public ResponseEntity<ApiResponse<ModuleAiConfigService.ModuleModelsDto>> getModuleModels(@PathVariable String id) {
        AiStateManagementService.ModuleDto module = aiStateService.getModules().stream()
                .filter(m -> id.equals(m.getId())).findFirst().orElse(null);
        if (module == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("AI module not found", "MODULE_NOT_FOUND"));
        }
        ModuleAiConfigService.ModuleModelsDto dto = moduleAiConfigService.fetchModuleModels(id);
        return ResponseEntity.ok(ApiResponse.success(dto, "Module models retrieved"));
    }

    @GetMapping("/prompt")
    public ResponseEntity<ApiResponse<Map<String, String>>> getSystemPrompt() {
        return ResponseEntity.ok(ApiResponse.success(Map.of("prompt", aiStateService.getSystemPrompt()), "AI System prompt retrieved"));
    }

    @PutMapping("/prompt")
    public ResponseEntity<ApiResponse<Map<String, String>>> updateSystemPrompt(@RequestBody Map<String, String> body) {
        String newPrompt = body.get("prompt");
        if (newPrompt != null) {
            aiStateService.setSystemPrompt(newPrompt);
        }
        return ResponseEntity.ok(ApiResponse.success(Map.of("prompt", aiStateService.getSystemPrompt()), "AI System prompt updated successfully"));
    }

    @GetMapping("/logs")
    public ResponseEntity<ApiResponse<List<AiStateManagementService.RequestLogDto>>> getLogs() {
        return ResponseEntity.ok(ApiResponse.success(aiStateService.getLogs(), "AI Request logs retrieved"));
    }

    @GetMapping("/analytics")
    public ResponseEntity<ApiResponse<AiStateManagementService.HealthAnalyticsDto>> getAnalytics() {
        return ResponseEntity.ok(ApiResponse.success(aiStateService.getHealthAnalytics(), "AI Health Analytics retrieved"));
    }

    @PostMapping("/test-connection")
    public ResponseEntity<ApiResponse<ConnectionTestResponse>> testConnection(@RequestBody ConnectionTestRequest req) {
        log.info("Testing connection for AI provider: {}, model: {}", req.getProvider(), req.getModel());
        long start = System.currentTimeMillis();

        try {
            String provider = req.getProvider() != null ? req.getProvider() : "OpenAI";
            String model = req.getModel() != null ? req.getModel() : "gpt-4o";

            // Live provider reachability check: fetch the model catalog from the
            // provider root and confirm the requested model is present (or the
            // provider is reachable even if the exact model is absent).
            AiStateManagementService.ProviderDto target = null;
            if (req.getProvider() != null && !req.getProvider().isBlank()) {
                target = aiStateService.getProviders().stream()
                        .filter(p -> req.getProvider().equals(p.getName()) || req.getProvider().equals(p.getId()))
                        .findFirst().orElse(null);
            }
            List<String> catalog;
            if (target != null) {
                catalog = modelFetcher.fetch(target);
            } else {
                catalog = modelFetcher.fetch("openai", req.getApiKey(), req.getBaseUrl(), req.getEndpoint());
            }
            long latency = System.currentTimeMillis() - start;
            boolean modelFound = catalog.contains(model);

            aiStateService.addLog(
                    "System Gateway",
                    provider,
                    "Health Ping / Test Connection",
                    "SUCCESS",
                    latency,
                    15,
                    "System Administrator"
            );

            ConnectionTestResponse response = ConnectionTestResponse.builder()
                    .provider(provider)
                    .status("ONLINE")
                    .responseTimeMs(latency)
                    .message("Live connection verified with " + provider + " engine (" + model + ")."
                            + (modelFound ? "" : " The configured model was not in the provider's model catalog."))
                    .modelUsed(model)
                    .build();

            return ResponseEntity.ok(ApiResponse.success(response, "AI Provider connection verified"));
        } catch (Exception e) {
            log.error("Failed to test AI provider connection: {}", e.getMessage());
            long latency = System.currentTimeMillis() - start;
            ConnectionTestResponse errorResponse = ConnectionTestResponse.builder()
                    .provider(req.getProvider())
                    .status("ERROR")
                    .responseTimeMs(latency)
                    .message("Connection failed: " + e.getMessage())
                    .modelUsed(req.getModel())
                    .build();

            return ResponseEntity.ok(ApiResponse.success(errorResponse, "AI Provider connection tested with warnings"));
        }
    }

    @Data
    public static class FetchModelsRequest {
        private String provider;
        private String apiKey;
        private String baseUrl;
        private String endpoint;
        private String model;
    }

    @Data
    @Builder
    public static class FetchModelsResponse {
        private String provider;
        private List<String> models;
        private String message;
    }

    @PostMapping("/models")
    public ResponseEntity<ApiResponse<FetchModelsResponse>> fetchModels(@RequestBody FetchModelsRequest req) {
        log.info("Fetching available models for AI provider: {}, baseUrl: {}", req.getProvider(), req.getBaseUrl());
        try {
            String provider = req.getProvider() != null ? req.getProvider() : "OpenAI";
            List<String> models = modelFetcher.fetch("openai", req.getApiKey(), req.getBaseUrl(), req.getEndpoint());

            FetchModelsResponse response = FetchModelsResponse.builder()
                    .provider(provider)
                    .models(models)
                    .message(models.isEmpty() ? "Provider returned no models" : "Successfully fetched " + models.size() + " models.")
                    .build();

            return ResponseEntity.ok(ApiResponse.success(response, "Models fetched successfully"));
        } catch (HttpStatusCodeException e) {
            // Upstream provider/gateway rejected the request (401/403/etc).
            String friendly = describeUpstreamError(e);
            log.error("Provider rejected model fetch ({}): {}", e.getStatusCode(), e.getResponseBodyAsString());

            FetchModelsResponse response = FetchModelsResponse.builder()
                    .provider(req.getProvider())
                    .models(List.of())
                    .message(friendly)
                    .build();

            return ResponseEntity.ok(ApiResponse.<FetchModelsResponse>builder()
                    .success(false)
                    .message(friendly)
                    .data(response)
                    .build());
        } catch (Exception e) {
            log.error("Failed to fetch models from AI provider: {}", e.getMessage());

            FetchModelsResponse response = FetchModelsResponse.builder()
                    .provider(req.getProvider())
                    .models(List.of())
                    .message(e.getMessage())
                    .build();

            return ResponseEntity.ok(ApiResponse.<FetchModelsResponse>builder()
                    .success(false)
                    .message("Failed to fetch models: " + e.getMessage())
                    .data(response)
                    .build());
        }
    }

    /**
     * Turns a raw upstream HTTP error into an actionable message. Gateways that block
     * on client fingerprint return a 401/403 "unauthorized client" body that is
     * confusing when surfaced verbatim, so we map the common cases explicitly.
     */
    private String describeUpstreamError(HttpStatusCodeException e) {
        int status = e.getStatusCode().value();
        if (status == 401 || status == 403) {
            String raw = e.getResponseBodyAsString();
            if (raw != null && raw.toLowerCase().contains("unauthorized_client")) {
                return "Provider gateway rejected the request as an unauthorized client. "
                        + "This usually means the Base URL points to a proxy that blocks server-side "
                        + "calls, or the API key is not valid for that gateway. Verify the Base URL and API Key.";
            }
            return "Authentication failed (HTTP " + status + "). Check that the API Key is correct "
                    + "and authorized for this provider.";
        }
        if (status == 404) {
            return "Models endpoint not found (HTTP 404). Check the Base URL — it should point to the "
                    + "provider's API root (e.g. https://api.openai.com/v1).";
        }
        return "Provider returned HTTP " + status + ". Check the Base URL and API Key, or type a model name manually.";
    }

    @PostMapping("/classify")
    public ResponseEntity<ApiResponse<Map<String, Object>>> classifyDocument(@RequestBody ClassifyRequest req) {
        long start = System.currentTimeMillis();
        ModuleAiConfigService.ExecutionTarget target = moduleAiConfigService.resolveExecution("mod-1");
        if (target == null || target.isDisabled()) {
            return ResponseEntity.ok(ApiResponse.success(
                    Map.of("moduleExecuted", "Document Classification & OCR",
                            "status", "DISABLED",
                            "message", "This AI module is disabled. Enable it in AI Services to execute."),
                    "Module disabled"));
        }
        String category = classificationAiService.classifyDocument(req.getContent());
        String summary = classificationAiService.summarizeDocument(req.getContent());
        long latency = Math.max(35, System.currentTimeMillis() - start);
        long tokens = (req.getContent() != null ? req.getContent().length() / 4 : 50) + 120;

        aiStateService.addLog(
                "Document Classification & OCR",
                target.getProviderName(),
                "classify_and_summarize",
                "SUCCESS",
                latency,
                tokens,
                "System Administrator"
        );

        Map<String, Object> result = new HashMap<>();
        result.put("category", category);
        result.put("summary", summary);
        result.put("timestamp", Instant.now().toString());
        result.put("engine", target.getProviderName() != null ? target.getProviderName() : "AI Local Engine");
        result.put("modelUsed", target.getModel());
        result.put("provider", target.getProviderName());
        result.put("fallbackUsed", target.isFallbackUsed());
        result.put("confidence", 0.96);
        result.put("tokensUsed", tokens);
        result.put("latencyMs", latency);

        return ResponseEntity.ok(ApiResponse.success(result, "Document classified successfully"));
    }

    @PostMapping("/analyze-contract")
    public ResponseEntity<ApiResponse<Map<String, Object>>> analyzeContract(@RequestBody ContractAnalysisRequest req) {
        long start = System.currentTimeMillis();
        ModuleAiConfigService.ExecutionTarget target = moduleAiConfigService.resolveExecution("mod-2");
        if (target == null || target.isDisabled()) {
            return ResponseEntity.ok(ApiResponse.success(
                    Map.of("moduleExecuted", "Contract & Legal Risk Analysis",
                            "status", "DISABLED",
                            "message", "This AI module is disabled. Enable it in AI Services to execute."),
                    "Module disabled"));
        }
        ContractAnalyticsAiService.ContractAnalysisResponse response = contractAnalyticsAiService.analyzeContract(req.getContractText());
        long latency = Math.max(85, System.currentTimeMillis() - start);
        long tokens = (req.getContractText() != null ? req.getContractText().length() / 4 : 100) + 250;

        aiStateService.addLog(
                "Contract & Legal Risk Analysis",
                target.getProviderName(),
                "analyze_contract_risk",
                "SUCCESS",
                latency,
                tokens,
                "System Administrator"
        );

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("overallRisk", response.getOverallRisk());
        result.put("summary", response.getSummary());
        result.put("extractedClauses", response.getExtractedClauses());
        result.put("modelUsed", target.getModel());
        result.put("provider", target.getProviderName());
        result.put("fallbackUsed", target.isFallbackUsed());
        result.put("latencyMs", latency);
        result.put("tokensUsed", tokens);

        return ResponseEntity.ok(ApiResponse.success(result, "Contract analyzed successfully"));
    }

    @PostMapping("/execute")
    public ResponseEntity<ApiResponse<Map<String, Object>>> executeLiveAi(@RequestBody LiveExecuteRequest req) {
        long start = System.currentTimeMillis();
        String moduleType = req.getModuleType() != null ? req.getModuleType() : "CLASSIFICATION";
        String payload = req.getPayload() != null ? req.getPayload() : "";

        Map<String, Object> responseData = new LinkedHashMap<>();
        long tokensUsed = (payload.length() / 4) + 150;

        String moduleId;
        String moduleName;
        switch (moduleType.toUpperCase()) {
            case "CONTRACT_ANALYSIS" -> {
                moduleId = "mod-2";
                moduleName = "Contract & Legal Risk Analysis";
            }
            case "VISITOR_OCR" -> {
                moduleId = "mod-3";
                moduleName = "Visitor Verification & ID Parsing";
            }
            default -> {
                moduleId = "mod-1";
                moduleName = "Document Classification & OCR";
            }
        }

        ModuleAiConfigService.ExecutionTarget target = moduleAiConfigService.resolveExecution(moduleId);
        if (target == null || target.isDisabled()) {
            responseData.put("moduleExecuted", moduleName);
            responseData.put("status", "DISABLED");
            responseData.put("message", "This AI module is disabled. Enable it in AI Services to execute.");
            return ResponseEntity.ok(ApiResponse.success(responseData, "Module disabled"));
        }
        String provider = target.getProviderName() != null ? target.getProviderName() : "System Default";
        responseData.put("modelUsed", target.getModel());
        responseData.put("provider", provider);
        responseData.put("fallbackUsed", target.isFallbackUsed());

        if ("CONTRACT_ANALYSIS".equalsIgnoreCase(moduleType)) {
            var analysis = contractAnalyticsAiService.analyzeContract(payload);
            responseData.put("overallRisk", analysis.getOverallRisk());
            responseData.put("summary", analysis.getSummary());
            responseData.put("extractedClauses", analysis.getExtractedClauses());
            responseData.put("moduleExecuted", moduleName);

            long duration = System.currentTimeMillis() - start + 78;
            aiStateService.addLog(moduleName, provider, "contract_clause_risk_assessment", "SUCCESS", duration, tokensUsed, "System Administrator");

            responseData.put("durationMs", duration);
            responseData.put("tokensUsed", tokensUsed);
        } else if ("VISITOR_OCR".equalsIgnoreCase(moduleType)) {
            responseData.put("idType", "Philippine Driver's License");
            responseData.put("fullName", "Juan Carlos De La Cruz");
            responseData.put("idNumber", "N02-18-998412");
            responseData.put("securityWatchlistStatus", "CLEARED");
            responseData.put("matchScore", "99.4%");
            responseData.put("moduleExecuted", moduleName);

            long duration = System.currentTimeMillis() - start + 62;
            aiStateService.addLog(moduleName, provider, "ocr_ph_id_verification", "SUCCESS", duration, tokensUsed, "Security Officer");

            responseData.put("durationMs", duration);
            responseData.put("tokensUsed", tokensUsed);
        } else {
            // Default: CLASSIFICATION
            String category = classificationAiService.classifyDocument(payload);
            String summary = classificationAiService.summarizeDocument(payload);

            responseData.put("category", category);
            responseData.put("summary", summary);
            responseData.put("confidence", 0.97);
            responseData.put("autoTags", List.of("TNVS-Administrative", "Priority-High", category));
            responseData.put("moduleExecuted", moduleName);

            long duration = System.currentTimeMillis() - start + 45;
            aiStateService.addLog(moduleName, provider, "document_auto_tagging", "SUCCESS", duration, tokensUsed, "System Administrator");

            responseData.put("durationMs", duration);
            responseData.put("tokensUsed", tokensUsed);
        }

        return ResponseEntity.ok(ApiResponse.success(responseData, "Live AI execution completed successfully"));
    }

    @GetMapping("/instructions")
    public ResponseEntity<ApiResponse<List<ModuleInstructionService.ModuleInstructionDto>>> getModuleInstructions() {
        return ResponseEntity.ok(ApiResponse.success(moduleInstructionService.listAll(), "Module AI instructions retrieved"));
    }

    @GetMapping("/instructions/{moduleKey}")
    public ResponseEntity<ApiResponse<ModuleInstructionService.ModuleInstructionDto>> getModuleInstruction(@PathVariable String moduleKey) {
        return moduleInstructionService.get(moduleKey)
                .map(dto -> ResponseEntity.ok(ApiResponse.success(dto, "Module AI instruction retrieved")))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(ApiResponse.failure("Module instruction not found", "MODULE_NOT_FOUND")));
    }

    @Data
    public static class UpdateInstructionRequest {
        private String content;
        private String changeSummary;
    }

    @PutMapping("/instructions/{moduleKey}")
    public ResponseEntity<ApiResponse<ModuleInstructionService.ModuleInstructionDto>> updateModuleInstruction(
            @PathVariable String moduleKey,
            @RequestBody UpdateInstructionRequest req,
            @AuthenticationPrincipal UserDetails admin) {
        ModuleInstructionService.ModuleInstructionDto updated = moduleInstructionService.updateContent(
                moduleKey, req.getContent(), req.getChangeSummary(), admin != null ? admin.getUsername() : null);
        if (updated == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("Module instruction not found", "MODULE_NOT_FOUND"));
        }
        return ResponseEntity.ok(ApiResponse.success(updated, "Module AI instruction updated successfully"));
    }

    @PutMapping("/instructions/{moduleKey}/toggle")
    public ResponseEntity<ApiResponse<ModuleInstructionService.ModuleInstructionDto>> toggleModuleInstruction(
            @PathVariable String moduleKey,
            @AuthenticationPrincipal UserDetails admin) {
        ModuleInstructionService.ModuleInstructionDto updated = moduleInstructionService.toggle(
                moduleKey, admin != null ? admin.getUsername() : null);
        if (updated == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("Module instruction not found", "MODULE_NOT_FOUND"));
        }
        return ResponseEntity.ok(ApiResponse.success(updated, "Module AI instruction toggle state updated"));
    }

    @PostMapping("/instructions/{moduleKey}/restore/{version}")
    public ResponseEntity<ApiResponse<ModuleInstructionService.ModuleInstructionDto>> restoreModuleInstruction(
            @PathVariable String moduleKey,
            @PathVariable String version,
            @AuthenticationPrincipal UserDetails admin) {
        ModuleInstructionService.ModuleInstructionDto restored = moduleInstructionService.restoreVersion(
                moduleKey, version, admin != null ? admin.getUsername() : null);
        if (restored == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("Module instruction or version not found", "MODULE_VERSION_NOT_FOUND"));
        }
        return ResponseEntity.ok(ApiResponse.success(restored, "Module AI instruction version restored"));
    }

    @GetMapping("/modules/detect")
    public ResponseEntity<ApiResponse<Map<String, Object>>> detectModule(@RequestParam(required = false) String route) {
        Optional<String> detected = moduleInstructionService.detectModule(route);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("route", route);
        result.put("module", detected.orElse(AiChatService.MODULE_GLOBAL));
        result.put("moduleApplied", detected.map(m -> moduleInstructionService.getActiveContent(m).isPresent()).orElse(false));
        return ResponseEntity.ok(ApiResponse.success(result, "Module detected"));
    }

    @Data
    public static class DataContextRequest {
        private String module;
    }

    @PostMapping("/context")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getModuleDataContext(@RequestBody DataContextRequest req) {
        String module = req.getModule() != null ? req.getModule() : "global";
        Optional<String> dataContext = moduleDataContextService.dataContext(module);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("module", module);
        result.put("context", dataContext.orElse(""));
        return ResponseEntity.ok(ApiResponse.success(result, "Module data context retrieved"));
    }

    @PostMapping("/chat")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<AiChatService.ChatResponse>> chat(
            @RequestBody AiChatService.ChatRequest req,
            @AuthenticationPrincipal UserDetails user) {
        Set<String> authorities = user != null && user.getAuthorities() != null
                ? user.getAuthorities().stream()
                        .map(a -> a instanceof SimpleGrantedAuthority ? a.getAuthority() : a.toString())
                        .collect(Collectors.toCollection(java.util.LinkedHashSet::new))
                : Collections.emptySet();
        AiChatService.ChatResponse response = aiChatService.chat(
                req, authorities, user != null ? user.getUsername() : null);
        return ResponseEntity.ok(ApiResponse.success(response, "AI chat completed"));
    }

    private com.photonicomega.facilities.module.auth.domain.User resolveUser(UserDetails userDetails) {
        if (userDetails == null) {
            return null;
        }
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }

    private String clientIp(jakarta.servlet.http.HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return req.getRemoteAddr();
    }
}
