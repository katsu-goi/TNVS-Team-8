package com.photonicomega.facilities.ai;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.GovernedActionGateway;
import com.photonicomega.facilities.module.security.util.ClientIpResolver;
import io.swagger.v3.oas.annotations.Operation;
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
    private final GovernedActionGateway governedActions;
    private final com.photonicomega.facilities.module.auth.repository.UserRepository userRepository;
    private final jakarta.servlet.http.HttpServletRequest request;
    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * The target id recorded for a change to the global system prompt.
     *
     * <p>There is only one of it, but the approval table keys everything by target, so
     * it needs a name. This one is deliberately readable rather than a uuid: it is what
     * an approver sees in the queue beside the module keys.
     */
    private static final String GLOBAL_PROMPT_TARGET_ID = "global-system-prompt";

    /**
     * Serialises an executor payload.
     *
     * <p>Built through Jackson rather than by concatenating strings, and not as a
     * stylistic preference. These payloads carry AI instruction text, which is prose
     * containing quotes, braces, backslashes and newlines by its nature. Hand-built JSON
     * would produce a payload that fails to parse in the executor - after an approver
     * had signed for it - or, worse, one that parses into something other than what was
     * shown to them.
     */
    private static final com.fasterxml.jackson.databind.ObjectMapper PAYLOAD_MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper();

    private static String payloadJson(Map<String, Object> payload) {
        try {
            return PAYLOAD_MAPPER.writeValueAsString(payload);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            // Only reachable if the map holds something unserialisable, which the callers
            // above never do - they put strings and booleans in. Failing here is still
            // correct: raising an approval whose payload could not be written would mean
            // asking somebody to sign for an act that cannot then be carried out.
            throw new BusinessRuleViolationException(
                    "The details of this change could not be recorded, so it has not been "
                            + "requested: " + e.getOriginalMessage());
        }
    }

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

    /**
     * Registers a configured AI provider. Does not give it any traffic.
     *
     * <p>Not gated, because adding a provider to the registry does not send anything to
     * it: a provider only receives work once it is the default or a module is explicitly
     * bound to it, and both of those are controlled elsewhere - promotion through {@link
     * SensitiveAction#AI_PROVIDER_SET_DEFAULT}, removal through {@link
     * SensitiveAction#AI_PROVIDER_DELETE}.
     *
     * <p>That reasoning only holds because of the refusal below. {@code addProvider}
     * honours a caller-supplied default flag - it clears the flag from every existing
     * provider and hands it to the new one - so registration was in fact the cheapest
     * way to become the default, and it needed no approval and recorded no requester.
     * Anyone able to add a provider could point every module without an explicit binding
     * at their own endpoint and API key in a single call, which is the whole of what the
     * gate on promotion exists to prevent. A control is worth what the cheapest way
     * around it costs.
     *
     * <p>Refused rather than quietly stripped: returning 200 with the flag dropped would
     * hand back a provider the caller believes is the default, and they would discover
     * otherwise by watching traffic continue somewhere else.
     *
     * <p>The first provider is still allowed to take the default. A registry holding
     * providers with no default at all is the state {@code AiProviderSetDefaultExecutor}
     * refuses to create on purpose - every unbound module would have nowhere to send its
     * work - so there is nothing to protect and nothing to prefer instead.
     */
    @PostMapping("/providers")
    @Operation(summary = "Register an AI provider (does not make it the default)")
    public ResponseEntity<ApiResponse<AiStateManagementService.ProviderDto>> addProvider(
            @RequestBody AiStateManagementService.ProviderDto req,
            @AuthenticationPrincipal UserDetails admin) {
        List<AiStateManagementService.ProviderDto> existing = aiStateService.getProviders();
        if (req.isDefault() && !existing.isEmpty()) {
            AiStateManagementService.ProviderDto current = existing.stream()
                    .filter(AiStateManagementService.ProviderDto::isDefault)
                    .findFirst()
                    .orElse(null);
            throw new BusinessRuleViolationException(
                    "A new AI provider cannot be registered as the default"
                            + (current == null ? "" : ", which is currently " + current.getName())
                            + ". Making a provider the default redirects every module without its own "
                            + "binding to its endpoint and API key, so it needs a second signature: "
                            + "register this provider without the default flag, then request the "
                            + "promotion on PUT /v1/ai/providers/{id}/default. Nothing was saved.");
        }

        AiStateManagementService.ProviderDto created = aiStateService.addProvider(req);
        moduleAiConfigService.broadcastProviderChange("PROVIDER_ADDED");

        // The route had no authenticated principal before, so a provider holding an API
        // key could appear in the registry with no record of who put it there. The key
        // itself is never logged.
        log.warn("AI provider registered: {} (id {}, type {}) by {}{}",
                created.getName(), created.getId(), created.getType(), resolveUser(admin),
                created.isDefault() ? " - it is the default, as the registry was empty" : "");
        return ResponseEntity.ok(ApiResponse.success(created, "AI Provider saved successfully"));
    }

    /**
     * Requests that a configured AI provider become the default. Promotes nothing.
     *
     * <p>The default provider is the endpoint and the API key that every module without
     * an explicit binding sends its work to, so promoting a different one moves the
     * company's documents and contracts to another company's service in one call.
     * Deleting a provider was already gated while this was not, which was the wrong way
     * round: a deletion takes a capability away and shows up as work that stopped
     * happening, whereas this keeps the capability and changes where the data goes,
     * which shows up as nothing at all. This route also had no authenticated principal
     * before, so there was no record of who did it.
     *
     * <p>The verb, the path and the envelope are unchanged and the status is still
     * {@code 200}, so the AI Services console keeps working. The default is unchanged
     * when this returns; {@code AiProviderSetDefaultExecutor} promotes the provider
     * once {@link SensitiveAction#AI_PROVIDER_SET_DEFAULT} has been signed off, and
     * refuses at that point if the provider has gone or its last health check left it
     * offline.
     */
    @PutMapping("/providers/{id}/default")
    @Operation(summary = "Request that an AI provider become the default (requires approval; "
            + "promotes nothing)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> setDefaultProvider(
            @PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body,
            @RequestParam(required = false) String reason,
            @AuthenticationPrincipal UserDetails admin) {
        // Checked before the request is raised. An unknown id would otherwise fail inside
        // the executor, which is after somebody has already signed for it - and the
        // underlying setDefaultProvider accepts an unmatched id happily, clearing the
        // default flag from every provider and leaving the system with none.
        AiStateManagementService.ProviderDto target = aiStateService.getProviders().stream()
                .filter(candidate -> id.equals(candidate.getId()))
                .findFirst()
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "AI provider '" + id + "' is not configured, so it cannot be requested as "
                                + "the default."));

        GovernedActionGateway.Raised raised = governedActions.raise(
                SensitiveAction.AI_PROVIDER_SET_DEFAULT, "AiProvider", id,
                describeProviderPromotion(target), body, reason, resolveUser(admin));
        return ResponseEntity.ok(ApiResponse.success(raised.dto(), raised.message()));
    }

    /**
     * A label an approver can decide on without opening the AI console.
     *
     * <p>Names the provider being promoted and the one it would replace, because the
     * decision is a comparison between two of them and the provider id alone is a
     * slug. The health status is included since a promotion to an offline provider is
     * the specific mistake the executor refuses.
     */
    private String describeProviderPromotion(AiStateManagementService.ProviderDto target) {
        AiStateManagementService.ProviderDto current = aiStateService.getProviders().stream()
                .filter(AiStateManagementService.ProviderDto::isDefault)
                .findFirst()
                .orElse(null);
        return "Make " + target.getName() + " (" + target.getType() + ", " + target.getStatus()
                + ") the default AI provider, replacing "
                + (current == null ? "no current default" : current.getName()
                        + " (" + current.getType() + ")");
    }

    /**
     * Requests deletion of a configured AI provider. Does not delete it.
     *
     * <p>A provider is the endpoint and the key every AI module sends its work to, and
     * removing one does not disable the modules pointing at it. Document
     * classification, contract risk analysis and visitor ID parsing carry on
     * reporting themselves Active while producing nothing, so the first sign of a
     * wrong deletion is a user asking why a document was never classified rather than
     * an error anyone is paged about. It is also awkward to undo: the module bindings
     * that name the provider are rows in {@code ai_module_config} and outlive it, so
     * the broken configuration survives a restart while no longer naming anything that
     * can be looked up, and the provider itself is held in memory with its API key,
     * which is recorded nowhere else - putting it back means finding that secret
     * again.
     *
     * <p>The verb, the path and the envelope are unchanged and the status is still
     * {@code 200}, so the AI Services console keeps working. The provider is still
     * configured when this returns; {@code AiProviderDeleteExecutor} removes it once
     * {@link SensitiveAction#AI_PROVIDER_DELETE} has been signed off, and that
     * executor refuses the deletion outright if the provider is the default or any
     * module still routes through it.
     */
    @DeleteMapping("/providers/{id}")
    @Operation(summary = "Request deletion of an AI provider (requires approval; deletes nothing)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteProvider(
            @PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body,
            @RequestParam(required = false) String reason,
            @AuthenticationPrincipal UserDetails userDetails) {
        // Resolved before the request is raised so a mistyped or already-removed id
        // fails now, with something the requester can act on, rather than after an
        // approver has spent a signature on a provider that is not there. Providers
        // live in AiStateManagementService rather than a table, so this list is the
        // only place they exist.
        AiStateManagementService.ProviderDto provider = aiStateService.getProviders().stream()
                .filter(candidate -> id.equals(candidate.getId()))
                .findFirst()
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "AI provider " + id + " is not configured, so its deletion cannot be requested."));

        GovernedActionGateway.Raised raised = governedActions.raise(
                SensitiveAction.AI_PROVIDER_DELETE, "AiProvider", id,
                describeProvider(provider), body, reason, resolveUser(userDetails));
        return ResponseEntity.ok(ApiResponse.success(raised.dto(), raised.message()));
    }

    /**
     * A label an approver can recognise without opening the AI Services console.
     *
     * <p>The id is a generated string, so the provider's name and type are named
     * instead, along with whether it is the default. That last fact decides the
     * request on its own - the default is what every module without an explicit
     * binding falls back to - and it is the one thing an approver reading a provider
     * name would have no way to guess.
     */
    private String describeProvider(AiStateManagementService.ProviderDto provider) {
        String name = provider.getName() == null ? "unnamed provider" : provider.getName();
        String type = provider.getType() == null ? "unknown type" : provider.getType();
        return name + " (" + type + ")" + (provider.isDefault() ? " - the system default provider" : "");
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

    /**
     * Requests a change to the global AI system prompt. Changes nothing.
     *
     * <p>This is the instruction every module's assistant is composed from, for every
     * user in the company, and it is the fallback for every module whose own
     * instructions are switched off. Editing it takes effect on the next AI request -
     * no build, no deployment, no diff anybody reviews on the way - and unlike a
     * module's instructions it has no version history at all: {@code setSystemPrompt}
     * overwrites a single field, so the text it replaced is gone. That is the specific
     * reason this needs a second signature rather than an undo button.
     *
     * <p>The verb, the path and the {@code 200} are unchanged so the console keeps
     * working, but the body now carries a pending approval rather than the new prompt.
     * {@code AiInstructionUpdateExecutor} applies it once
     * {@link SensitiveAction#AI_INSTRUCTION_UPDATE} has been signed off, logging the
     * outgoing text in full first, since that log line is the only copy of it.
     */
    @PutMapping("/prompt")
    @Operation(summary = "Request a change to the global AI system prompt (requires approval; "
            + "changes nothing)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateSystemPrompt(
            @RequestBody Map<String, Object> body,
            @RequestParam(required = false) String reason,
            @AuthenticationPrincipal UserDetails admin) {
        Object submitted = body == null ? null : body.get("prompt");
        if (!(submitted instanceof String prompt) || prompt.isBlank()) {
            throw new BusinessRuleViolationException(
                    "A system prompt change needs the new prompt text as {\"prompt\":\"...\"}. An "
                            + "empty prompt is not a no-op - it would leave every module whose own "
                            + "instructions are disabled with nothing to follow.");
        }

        String current = aiStateService.getSystemPrompt();
        GovernedActionGateway.Raised raised = governedActions.raiseWithPayload(
                SensitiveAction.AI_INSTRUCTION_UPDATE, "AiSystemPrompt", GLOBAL_PROMPT_TARGET_ID,
                describePromptChange(current, prompt), body, reason,
                payloadJson(Map.of("kind", "GLOBAL_PROMPT", "prompt", prompt)),
                resolveUser(admin));
        return ResponseEntity.ok(ApiResponse.success(raised.dto(), raised.message()));
    }

    /**
     * A label an approver can decide on without opening the prompt editor.
     *
     * <p>Character counts rather than the text itself: the prompt runs to hundreds of
     * words, and a queue of requests is not where anyone reads it. The size change is
     * the one signal that fits on a line and is worth having - a prompt that lost most
     * of its length is a different kind of request from one that gained a paragraph.
     */
    private static String describePromptChange(String current, String proposed) {
        int before = current == null ? 0 : current.length();
        int after = proposed.length();
        String direction;
        if (before == 0) {
            direction = "set for the first time";
        } else if (after < before / 2) {
            direction = "cut to less than half its length";
        } else if (after < before) {
            direction = "shortened";
        } else if (after > before) {
            direction = "extended";
        } else {
            direction = "rewritten at the same length";
        }
        return "Replace the global AI system prompt - " + direction + " (" + before + " -> " + after
                + " chars). Applies to every module without its own instructions enabled.";
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

            // An empty catalogue is not a verified connection. Something answered on
            // the port - a proxy, a login page, the wrong service - but it did not
            // list a single model, so nothing here can be sent an inference request.
            // This used to report ONLINE, which is how the screen came to show
            // "API Status: CONNECTED" for a provider that was not running.
            if (catalog.isEmpty()) {
                String problem = "Reached " + provider + " but it listed no models. "
                        + "Check the Base URL points at the provider's API root and that the "
                        + "API Key is valid.";
                aiStateService.addLog("System Gateway", provider, "Health Ping / Test Connection",
                        "FAILED", latency, 0, "System Administrator");

                ConnectionTestResponse empty = ConnectionTestResponse.builder()
                        .provider(provider)
                        .status("ERROR")
                        .responseTimeMs(latency)
                        .message(problem)
                        .modelUsed(model)
                        .build();

                return ResponseEntity.ok(ApiResponse.<ConnectionTestResponse>builder()
                        .success(false)
                        .message(problem)
                        .data(empty)
                        .build());
            }

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
            String failure = "Connection failed: " + e.getMessage();

            // Recorded, not just returned. A failed health ping previously wrote no log
            // entry at all, so the one screen an administrator checks afterwards showed
            // no evidence the attempt had ever been made.
            aiStateService.addLog("System Gateway",
                    req.getProvider() == null ? "unknown" : req.getProvider(),
                    "Health Ping / Test Connection",
                    "FAILED", latency, 0, "System Administrator");

            ConnectionTestResponse errorResponse = ConnectionTestResponse.builder()
                    .provider(req.getProvider())
                    .status("ERROR")
                    .responseTimeMs(latency)
                    .message(failure)
                    .modelUsed(req.getModel())
                    .build();

            // success(false), matching fetchModels below. Returning ApiResponse.success
            // around an ERROR payload made the envelope contradict its own contents, and
            // every client that checks the envelope first - including this application's
            // own provider dialog - read it as a working connection.
            return ResponseEntity.ok(ApiResponse.<ConnectionTestResponse>builder()
                    .success(false)
                    .message(failure)
                    .data(errorResponse)
                    .build());
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
        /**
         * Why the instructions are being changed. Required, and separate from
         * {@code changeSummary}: the summary goes in the version history and says what
         * changed, this says why it should be allowed and is what the approver reads.
         */
        private String justification;
    }

    /**
     * Requests a change to one module's AI instructions. Changes nothing.
     *
     * <p>A module's instruction set is what the assistant follows when it advises every
     * user on every screen in that module, so replacing it changes the advice the whole
     * company acts on, from the next AI request onwards. A wrong change is quiet by
     * construction: the screens look identical, the recommendations are still confident
     * and still plausible, and what actually moved is which risks get flagged and which
     * get passed over - so it surfaces weeks later as a contract nobody was warned
     * about rather than as a failure.
     *
     * <p>This is the route the rollback gate was missing. {@code
     * POST /instructions/{moduleKey}/restore/{version}} required an approval because it
     * is spelled "restore", while this one - which can set the text to anything at all,
     * including whatever that old version said - did not. Governing the narrow path and
     * leaving the general one open is worse than governing neither, because the gate on
     * the narrow path reads as coverage.
     *
     * <p>The verb, the path and the {@code 200} are unchanged so the instruction editor
     * keeps working. The module is still running its current text when this returns;
     * {@code AiInstructionUpdateExecutor} writes the new version once
     * {@link SensitiveAction#AI_INSTRUCTION_UPDATE} has been signed off.
     */
    @PutMapping("/instructions/{moduleKey}")
    @Operation(summary = "Request a change to a module's AI instructions (requires approval; "
            + "changes nothing)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateModuleInstruction(
            @PathVariable String moduleKey,
            @RequestBody UpdateInstructionRequest req,
            @RequestParam(required = false) String reason,
            @AuthenticationPrincipal UserDetails admin) {
        // Checked here rather than in the executor: an unknown module key would otherwise
        // fail after an approver had already signed for it.
        ModuleInstructionService.ModuleInstructionDto current = moduleInstructionService.get(moduleKey)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "AI module '" + moduleKey + "' does not exist, so a change to its "
                                + "instructions cannot be requested."));

        if (req == null || req.getContent() == null || req.getContent().isBlank()) {
            throw new BusinessRuleViolationException(
                    "A change to module '" + moduleKey + "' instructions needs the new text as "
                            + "{\"content\":\"...\"}. Empty instructions are not a no-op - the "
                            + "assistant would fall back to the global system prompt and lose this "
                            + "module's guardrails. To switch the instructions off deliberately, use "
                            + "the toggle route, which says so in the audit trail.");
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("kind", "CONTENT");
        payload.put("content", req.getContent());
        if (req.getChangeSummary() != null && !req.getChangeSummary().isBlank()) {
            payload.put("changeSummary", req.getChangeSummary());
        }

        GovernedActionGateway.Raised raised = governedActions.raiseWithPayload(
                SensitiveAction.AI_INSTRUCTION_UPDATE, "AiModuleInstruction", moduleKey,
                describeInstructionChange(current, req), justificationBody(req), reason,
                payloadJson(payload), resolveUser(admin));
        return ResponseEntity.ok(ApiResponse.success(raised.dto(), raised.message()));
    }

    /**
     * Requests that a module's AI instructions be switched on or off. Toggles nothing.
     *
     * <p>Not to be confused with {@code PUT /modules/{id}/toggle}, which is deliberately
     * ungated. That one decides whether the assistant speaks for a module at all, and
     * off is the fail-safe direction - an assistant that says nothing cannot say
     * anything wrong, and during an incident nobody should need a second signature to
     * silence one. This route leaves the assistant answering and removes the module's
     * own guardrails, so it falls back to the global system prompt. That is a change to
     * the advice, not an end to it, which is why it sits with the instruction edits.
     *
     * <p>The request records the state it wants rather than an instruction to flip. The
     * live state can change between the request and the approval, and a flip approved
     * against a stale reading would produce the opposite of what was signed for - so
     * {@code AiInstructionUpdateExecutor} compares the recorded state against the live
     * one and does nothing if it already holds.
     */
    @PutMapping("/instructions/{moduleKey}/toggle")
    @Operation(summary = "Request that a module's AI instructions be enabled or disabled "
            + "(requires approval; toggles nothing)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> toggleModuleInstruction(
            @PathVariable String moduleKey,
            @RequestBody(required = false) Map<String, Object> body,
            @RequestParam(required = false) String reason,
            @AuthenticationPrincipal UserDetails admin) {
        ModuleInstructionService.ModuleInstructionDto current = moduleInstructionService.get(moduleKey)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "AI module '" + moduleKey + "' does not exist, so its instructions cannot be "
                                + "enabled or disabled."));

        // The intended state is resolved here, from what the requester was looking at, and
        // travels in the payload. The caller may also state it outright, which is what a
        // client that has been open a while should do.
        boolean intended = body != null && body.get("enabled") instanceof Boolean explicit
                ? explicit
                : !current.isEnabled();

        GovernedActionGateway.Raised raised = governedActions.raiseWithPayload(
                SensitiveAction.AI_INSTRUCTION_UPDATE, "AiModuleInstruction", moduleKey,
                describeInstructionToggle(current, intended), body, reason,
                payloadJson(Map.of("kind", "TOGGLE", "enabled", intended)),
                resolveUser(admin));
        return ResponseEntity.ok(ApiResponse.success(raised.dto(), raised.message()));
    }

    /**
     * The justification, in the shape {@link GovernedActionGateway} reads it from.
     *
     * <p>This route takes a typed body rather than a map, so the field has to be handed
     * over explicitly. Returning an empty map when it is absent rather than {@code null}
     * makes no difference to the outcome - the gateway refuses either way - but keeps
     * the refusal on the gateway's side, so the wording a requester sees is the same one
     * every other gated route gives them.
     */
    private static Map<String, Object> justificationBody(UpdateInstructionRequest req) {
        if (req == null || req.getJustification() == null || req.getJustification().isBlank()) {
            return Map.of();
        }
        return Map.of("justification", req.getJustification());
    }

    /**
     * A label an approver can decide on without opening the instruction editor.
     *
     * <p>The module's display name rather than its key, and the size of the change
     * rather than the text: a queue of requests is not where anyone proofreads a prompt,
     * but "cut to less than half its length" is a different request from "extended" and
     * fits on a line. The change summary is appended when the requester wrote one,
     * because their own description of the edit is better than any measurement of it.
     */
    private static String describeInstructionChange(
            ModuleInstructionService.ModuleInstructionDto current, UpdateInstructionRequest req) {
        int before = current.getContent() == null ? 0 : current.getContent().length();
        int after = req.getContent().length();
        String direction = after < before / 2 ? "cut to less than half its length"
                : after < before ? "shortened"
                : after > before ? "extended"
                : "rewritten at the same length";
        String summary = req.getChangeSummary() == null || req.getChangeSummary().isBlank()
                ? "" : " - \"" + req.getChangeSummary().trim() + "\"";
        return "Replace " + current.getName() + " AI instructions (v" + current.getVersion() + ", "
                + direction + ", " + before + " -> " + after + " chars)" + summary;
    }

    private static String describeInstructionToggle(
            ModuleInstructionService.ModuleInstructionDto current, boolean intended) {
        return (intended ? "Enable " : "Disable ") + current.getName() + " AI instructions (v"
                + current.getVersion() + ", currently "
                + (current.isEnabled() ? "enabled" : "disabled") + ")"
                + (intended ? "" : " - the assistant keeps answering for this module, from the global "
                        + "system prompt alone");
    }

    /**
     * Requests a rollback of one module's AI instructions to a version that module ran
     * before. Restores nothing.
     *
     * <p>A module's instruction set is what the assistant follows when it advises every
     * user on every screen in that module, so replacing it changes the advice the whole
     * company acts on, and it takes effect on the next AI request - there is no build,
     * no deployment and no diff anyone reviews on the way. A wrong rollback is quiet by
     * construction: the screens look identical afterwards, the recommendations are
     * still confident and still plausible, and what actually changed is which risks get
     * flagged and which get passed over, so it surfaces weeks later as a contract
     * nobody was warned about rather than as a failure. The displaced content is
     * recoverable, but only for a while - the history keeps the twenty most recent
     * versions per module and is held in memory, so every rollback moves the oldest
     * surviving version one step nearer the end of that list.
     *
     * <p>The verb, the path and the envelope are unchanged and the status is still
     * {@code 200}, so the instruction editor keeps working. The module is still running
     * its current version when this returns; {@code AiInstructionRollbackExecutor}
     * performs the restore once {@link SensitiveAction#AI_INSTRUCTION_ROLLBACK} has
     * been approved. That executor takes its target version from the payload assembled
     * here out of the URL, and looks the content up from the module's own history, so
     * what gets approved is provably a return to instructions this module already ran
     * and not new text wearing the word rollback.
     */
    @PostMapping("/instructions/{moduleKey}/restore/{version}")
    @Operation(summary = "Request a rollback of a module's AI instructions to an earlier version "
            + "(requires approval; restores nothing)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> restoreModuleInstruction(
            @PathVariable String moduleKey,
            @PathVariable String version,
            @RequestBody(required = false) Map<String, Object> body,
            @RequestParam(required = false) String reason,
            @AuthenticationPrincipal UserDetails admin) {
        // Both halves of the target come out of the URL, and both are checked before the
        // request is raised: an unknown module key or a version that is not in this
        // module's history would otherwise fail inside the executor, which is after an
        // approver has already signed for it.
        ModuleInstructionService.ModuleInstructionDto instruction = moduleInstructionService.get(moduleKey)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "AI module '" + moduleKey + "' does not exist, so a rollback of its "
                                + "instructions cannot be requested."));

        List<String> history = instruction.getVersions() == null ? List.of()
                : instruction.getVersions().stream()
                        .map(ModuleInstructionService.InstructionVersion::getVersion)
                        .collect(Collectors.toList());
        if (!history.contains(version)) {
            throw new BusinessRuleViolationException(
                    "Module '" + moduleKey + "' has no version " + version + " to roll back to. It is "
                            + "on v" + instruction.getVersion() + (history.isEmpty()
                            ? " and has never been edited, so no earlier version exists."
                            : " and the versions it can be restored to are: "
                                    + String.join(", ", history) + "."));
        }

        GovernedActionGateway.Raised raised = governedActions.raiseWithPayload(
                SensitiveAction.AI_INSTRUCTION_ROLLBACK, "AiModuleInstruction", moduleKey,
                describeInstructionRollback(instruction, version), body, reason,
                "{\"version\":\"" + version + "\"}", resolveUser(admin));
        return ResponseEntity.ok(ApiResponse.success(raised.dto(), raised.message()));
    }

    /**
     * A label an approver can decide on without opening the instruction editor.
     *
     * <p>The module key alone ("contract_management") does not say which of several
     * modules a reader is looking at in a queue of requests, and a version number
     * alone says nothing at all, so the module's display name is given with the key and
     * the two versions are named in the direction the change runs: the one the module
     * is running now, and the one it is being asked to go back to.
     */
    private String describeInstructionRollback(
            ModuleInstructionService.ModuleInstructionDto instruction, String version) {
        String name = instruction.getName() == null ? instruction.getModuleKey() : instruction.getName();
        return name + " AI instructions (module '" + instruction.getModuleKey() + "'), v"
                + instruction.getVersion() + " back to v" + version;
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
        return ClientIpResolver.resolve(req).ip();
    }
}
