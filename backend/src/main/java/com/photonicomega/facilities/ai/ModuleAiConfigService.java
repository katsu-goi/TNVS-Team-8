package com.photonicomega.facilities.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.ai.domain.AiModuleConfig;
import com.photonicomega.facilities.ai.repository.AiModuleConfigRepository;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.service.AuditService;
import jakarta.annotation.PostConstruct;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-module AI configuration service. The database is the source of truth for
 * which provider/model each AI module executes with; providers themselves remain
 * in-memory in {@link AiStateManagementService}. Every administrator save:
 * <ul>
 *   <li>persists the binding to {@code ai_module_config}</li>
 *   <li>writes an audit record (previous/new provider+model, changed by, timestamp)</li>
 *   <li>broadcasts the change on {@code /topic/ai/config} for realtime UI refresh</li>
 *   <li>validates provider capability coverage against module requirements</li>
 * </ul>
 * Effective model resolution: explicit assignment -> default model -> provider model.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ModuleAiConfigService {

    private final AiModuleConfigRepository configRepository;
    private final AiStateManagementService aiStateService;
    private final AuditService auditService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final ModelFetcher modelFetcher;

    public static final String TOPIC = "/topic/ai/config";

    /** Required capability ids per AI module id (mod-1..mod-5). */
    private static final Map<String, List<String>> MODULE_REQUIRED_CAPABILITIES = new HashMap<>();
    private static final Map<String, String> MODULE_INSTRUCTION_KEY = new HashMap<>();
    static {
        MODULE_REQUIRED_CAPABILITIES.put("mod-1", List.of("documentClassification", "ocrExtraction", "aiSummarization"));
        MODULE_REQUIRED_CAPABILITIES.put("mod-2", List.of("contractAnalysis", "aiSummarization"));
        MODULE_REQUIRED_CAPABILITIES.put("mod-3", List.of("visitorVerification", "ocrExtraction"));
        MODULE_REQUIRED_CAPABILITIES.put("mod-4", List.of("recordsCompliance", "legalReview"));
        MODULE_REQUIRED_CAPABILITIES.put("mod-5", List.of("smartSearch"));
        MODULE_INSTRUCTION_KEY.put("mod-1", "document_management");
        MODULE_INSTRUCTION_KEY.put("mod-2", "contract_management");
        MODULE_INSTRUCTION_KEY.put("mod-3", "visitor_management");
        MODULE_INSTRUCTION_KEY.put("mod-4", "records_management");
        MODULE_INSTRUCTION_KEY.put("mod-5", null);
    }

    private final Map<String, AiModuleConfig> cache = new ConcurrentHashMap<>();

    public static final String EXECUTION_REALTIME = "REALTIME";
    public static final String EXECUTION_BATCH = "BATCH";
    public static final String EXECUTION_FAILOVER = "FAILOVER";

    @Data
    @Builder
    public static class ModuleConfigDto {
        private String id;
        private String name;
        private String iconName;
        private boolean enabled;
        private String status;
        private List<String> features;
        private String providerId;
        private String providerName;
        private String model;
        private String fallbackModel;
        private String executionMode;
        private List<String> enabledFeatures;
        private List<String> requiredCapabilities;
        private List<String> capabilityWarnings;
        private String modelStatus; // AVAILABLE, OFFLINE, UNKNOWN
        private String modelStatusMessage;
        private String instructionModuleKey;
        private boolean usesSystemDefault;
        private boolean assignedProviderMissing;
        private String defaultProviderId;
        private String defaultProviderName;
        private String defaultModel;
    }

    @Data
    @Builder
    public static class ModuleModelsDto {
        private String providerId;
        private String providerName;
        private List<String> models;
        private String status;
        private String message;
    }

    @Data
    @Builder
    public static class ExecutionTarget {
        private String moduleId;
        private String moduleName;
        private String providerId;
        private String providerName;
        private String model;
        private boolean fallbackUsed;
        private String fallbackFrom;
        private boolean disabled;
    }

    @Data
    public static class UpdateModuleConfigRequest {
        private boolean enabled;
        private String providerId;
        private String model;
        private String fallbackModel;
        private String executionMode;
        private List<String> enabledFeatures;
    }

    @Data
    @Builder
    public static class UpdateResult {
        private ModuleConfigDto config;
        private List<String> warnings;
    }

    // ------------------------------------------------------------------
    // Startup load + cache
    // ------------------------------------------------------------------

    @PostConstruct
    public void init() {
        loadDefaults();
    }

    public void loadDefaults() {
        cache.clear();
        for (AiModuleConfig cfg : configRepository.findAllByDeletedFalse()) {
            cache.put(cfg.getModuleKey(), cfg);
        }
        log.info("Loaded {} per-module AI configs from ai_module_config", cache.size());
    }

    public void reset() {
        loadDefaults();
    }

    public Optional<AiModuleConfig> get(String moduleId) {
        return Optional.ofNullable(cache.get(moduleId));
    }

    /** Maps an AI module id (mod-1..mod-5) to its instruction module key. */
    public String instructionModuleKey(String moduleId) {
        return MODULE_INSTRUCTION_KEY.get(moduleId);
    }

    /** Maps an instruction module key to the AI module id that executes it. */
    public Optional<String> aiModuleForInstruction(String instructionKey) {
        for (Map.Entry<String, String> e : MODULE_INSTRUCTION_KEY.entrySet()) {
            if (instructionKey != null && instructionKey.equals(e.getValue())) {
                return Optional.of(e.getKey());
            }
        }
        return Optional.empty();
    }

    // ------------------------------------------------------------------
    // Defaults + effective resolution
    // ------------------------------------------------------------------

    private AiStateManagementService.ProviderDto defaultProvider() {
        return aiStateService.getProviders().stream()
                .filter(AiStateManagementService.ProviderDto::isDefault)
                .findFirst()
                .orElseGet(() -> aiStateService.getProviders().isEmpty()
                        ? null : aiStateService.getProviders().get(0));
    }

    private AiStateManagementService.ProviderDto providerById(String providerId) {
        if (providerId == null || providerId.isBlank()) {
            return defaultProvider();
        }
        return aiStateService.getProviders().stream()
                .filter(p -> providerId.equals(p.getId()))
                .findFirst()
                .orElse(defaultProvider());
    }

    /** True when a provider with the given id exists in the registry. */
    public boolean providerExists(String providerId) {
        if (providerId == null || providerId.isBlank()) {
            return true;
        }
        return aiStateService.getProviders().stream()
                .anyMatch(p -> providerId.equals(p.getId()));
    }

    private boolean isUsableProvider(AiStateManagementService.ProviderDto p) {
        return p != null && "CONNECTED".equalsIgnoreCase(p.getStatus())
                && p.getApiKey() != null && !p.getApiKey().isBlank()
                && !"sk-proj-default".equals(p.getApiKey());
    }

    /**
     * Resolves the execution target (provider + model) for an AI module.
     * Explicit assignment wins; otherwise the default model; otherwise the
     * provider's configured model. When the assigned provider is unusable and a
     * fallback model is explicitly configured, the fallback is used and the
     * fallback event is logged. Returns {@code null} when the module is disabled
     * or no usable provider exists (caller falls back to heuristic output).
     */
    public ExecutionTarget resolveExecution(String moduleId) {
        AiStateManagementService.ModuleDto module = aiStateService.getModules().stream()
                .filter(m -> moduleId.equals(m.getId()))
                .findFirst().orElse(null);
        if (module == null) {
            return null;
        }
        AiModuleConfig cfg = cache.get(moduleId);
        boolean moduleEnabled = module.isEnabled() && (cfg == null || cfg.isEnabled());
        if (!moduleEnabled) {
            return ExecutionTarget.builder()
                    .moduleId(moduleId)
                    .moduleName(module.getName())
                    .disabled(true)
                    .build();
        }

        AiStateManagementService.ProviderDto assignedProvider = providerById(cfg != null ? cfg.getProviderId() : null);
        String assignedModel = (cfg != null && cfg.getModel() != null && !cfg.getModel().isBlank())
                ? cfg.getModel()
                : (assignedProvider != null ? assignedProvider.getModel() : null);

        if (isUsableProvider(assignedProvider) && assignedModel != null && !assignedModel.isBlank()) {
            return ExecutionTarget.builder()
                    .moduleId(moduleId)
                    .moduleName(module.getName())
                    .providerId(assignedProvider.getId())
                    .providerName(assignedProvider.getName())
                    .model(assignedModel)
                    .fallbackUsed(false)
                    .build();
        }

        // Assigned provider unavailable -> explicit fallback model (same provider)
        // or default provider/model.
        String fallbackModel = cfg != null ? cfg.getFallbackModel() : null;
        AiStateManagementService.ProviderDto fallbackProvider = defaultProvider();
        if (fallbackModel != null && !fallbackModel.isBlank() && isUsableProvider(fallbackProvider)) {
            log.warn("AI module {}: assigned model unavailable, falling back to model '{}'", moduleId, fallbackModel);
            aiStateService.addLog(module.getName(), fallbackProvider.getName(),
                    "model_fallback", "WARNING", 0, 0, "System");
            return ExecutionTarget.builder()
                    .moduleId(moduleId)
                    .moduleName(module.getName())
                    .providerId(fallbackProvider.getId())
                    .providerName(fallbackProvider.getName())
                    .model(fallbackModel)
                    .fallbackUsed(true)
                    .fallbackFrom(assignedModel)
                    .build();
        }

        if (isUsableProvider(fallbackProvider) && fallbackProvider.getModel() != null && !fallbackProvider.getModel().isBlank()) {
            return ExecutionTarget.builder()
                    .moduleId(moduleId)
                    .moduleName(module.getName())
                    .providerId(fallbackProvider.getId())
                    .providerName(fallbackProvider.getName())
                    .model(fallbackProvider.getModel())
                    .fallbackUsed(assignedProvider != fallbackProvider)
                    .fallbackFrom(assignedModel)
                    .build();
        }

        return null;
    }

    // ------------------------------------------------------------------
    // Read (enriched module list) + model catalog
    // ------------------------------------------------------------------

    /**
     * Returns the enriched module list: each AI module merged with its persisted
     * config, assigned provider/model, capability warnings, and model status.
     */
    public List<ModuleConfigDto> listModules() {
        List<ModuleConfigDto> result = new ArrayList<>();
        for (AiStateManagementService.ModuleDto module : aiStateService.getModules()) {
            result.add(toConfigDto(module, cache.get(module.getId())));
        }
        return result;
    }

    public Optional<ModuleConfigDto> getModuleConfig(String moduleId) {
        return aiStateService.getModules().stream()
                .filter(m -> moduleId.equals(m.getId()))
                .findFirst()
                .map(m -> toConfigDto(m, cache.get(moduleId)));
    }

    private ModuleConfigDto toConfigDto(AiStateManagementService.ModuleDto module, AiModuleConfig cfg) {
        boolean enabled = module.isEnabled() && (cfg == null || cfg.isEnabled());

        // Detect a stale assignment: the configured provider was deleted.
        boolean assignedProviderMissing = cfg != null && cfg.getProviderId() != null
                && !cfg.getProviderId().isBlank() && !providerExists(cfg.getProviderId());

        AiStateManagementService.ProviderDto provider = providerById(cfg != null ? cfg.getProviderId() : null);
        String model = (cfg != null && cfg.getModel() != null && !cfg.getModel().isBlank())
                ? cfg.getModel()
                : (provider != null ? provider.getModel() : null);

        // System default = no explicit assignment (or the assigned provider no
        // longer exists), so the default provider/model applies.
        boolean usesSystemDefault = cfg == null || cfg.getProviderId() == null
                || cfg.getProviderId().isBlank() || assignedProviderMissing;
        AiStateManagementService.ProviderDto defaultP = defaultProvider();

        List<String> required = MODULE_REQUIRED_CAPABILITIES.getOrDefault(module.getId(), List.of());
        List<String> warnings = new ArrayList<>(capabilityWarnings(module.getId(), provider));
        if (assignedProviderMissing) {
            warnings.add("The assigned AI provider no longer exists. This module will use the system default provider until re-configured.");
        }
        String modelStatus = provider != null && isUsableProvider(provider)
                ? "AVAILABLE" : "OFFLINE";
        String statusMessage = modelStatus.equals("AVAILABLE")
                ? "Provider " + (provider != null ? provider.getName() : "?") + " is connected and configured."
                : "No usable provider/key configured. This module will fall back to safe local processing.";

        List<String> features = module.getFeatures();
        List<String> enabledFeatures = new ArrayList<>();
        if (cfg != null && cfg.getFeatures() != null && !cfg.getFeatures().isBlank()) {
            try {
                enabledFeatures = objectMapper.readValue(cfg.getFeatures(), new TypeReference<List<String>>() {});
            } catch (JsonProcessingException e) {
                log.warn("Failed to parse stored features for {}: {}", module.getId(), e.getMessage());
                enabledFeatures = features;
            }
        } else {
            enabledFeatures = new ArrayList<>(features);
        }

        return ModuleConfigDto.builder()
                .id(module.getId())
                .name(module.getName())
                .iconName(module.getIconName())
                .enabled(enabled)
                .status(module.isEnabled() ? (enabled ? "Active" : "Standby") : "Disabled")
                .features(features)
                .providerId(provider != null ? provider.getId() : null)
                .providerName(provider != null ? provider.getName() : null)
                .model(model)
                .fallbackModel(cfg != null ? cfg.getFallbackModel() : null)
                .executionMode(cfg != null && cfg.getExecutionMode() != null ? cfg.getExecutionMode() : EXECUTION_REALTIME)
                .enabledFeatures(enabledFeatures)
                .requiredCapabilities(required)
                .capabilityWarnings(warnings)
                .modelStatus(modelStatus)
                .modelStatusMessage(statusMessage)
                .instructionModuleKey(MODULE_INSTRUCTION_KEY.get(module.getId()))
                .usesSystemDefault(usesSystemDefault)
                .assignedProviderMissing(assignedProviderMissing)
                .defaultProviderId(defaultP != null ? defaultP.getId() : null)
                .defaultProviderName(defaultP != null ? defaultP.getName() : null)
                .defaultModel(defaultP != null ? defaultP.getModel() : null)
                .build();
    }

    private List<String> capabilityWarnings(String moduleId, AiStateManagementService.ProviderDto provider) {
        List<String> warnings = new ArrayList<>();
        List<String> required = MODULE_REQUIRED_CAPABILITIES.getOrDefault(moduleId, List.of());
        if (required.isEmpty() || provider == null) {
            return warnings;
        }
        List<String> provided = provider.getCapabilities() != null ? provider.getCapabilities() : List.of();
        for (String req : required) {
            if (!provided.contains(req)) {
                warnings.add("Provider does not advertise capability '" + req + "' required by this module.");
            }
        }
        return warnings;
    }

    // ------------------------------------------------------------------
    // Update
    // ------------------------------------------------------------------

    @Transactional
    public UpdateResult updateConfig(String moduleId, UpdateModuleConfigRequest req, User user, String ipAddress) {
        AiStateManagementService.ModuleDto module = aiStateService.getModules().stream()
                .filter(m -> moduleId.equals(m.getId()))
                .findFirst().orElse(null);
        if (module == null) {
            return null;
        }

        AiModuleConfig cfg = cache.get(moduleId);
        boolean isNew = cfg == null;
        if (cfg == null) {
            cfg = new AiModuleConfig();
            cfg.setModuleKey(moduleId);
        }

        AiStateManagementService.ProviderDto previousProvider = providerById(cfg.getProviderId());
        String previousModel = (cfg.getModel() != null && !cfg.getModel().isBlank())
                ? cfg.getModel() : (previousProvider != null ? previousProvider.getModel() : null);

        cfg.setEnabled(req.isEnabled());
        cfg.setProviderId(req.getProviderId());
        cfg.setModel(req.getModel());
        cfg.setFallbackModel(req.getFallbackModel());
        cfg.setExecutionMode(req.getExecutionMode() != null && !req.getExecutionMode().isBlank()
                ? req.getExecutionMode() : EXECUTION_REALTIME);
        if (req.getEnabledFeatures() != null) {
            try {
                cfg.setFeatures(objectMapper.writeValueAsString(req.getEnabledFeatures()));
            } catch (JsonProcessingException e) {
                log.warn("Failed to serialize enabled features for {}: {}", moduleId, e.getMessage());
            }
        }

        configRepository.save(cfg);
        cache.put(moduleId, cfg);

        AiStateManagementService.ProviderDto newProvider = providerById(req.getProviderId());
        String newModel = (req.getModel() != null && !req.getModel().isBlank())
                ? req.getModel() : (newProvider != null ? newProvider.getModel() : null);

        // Audit record
        String action = isNew ? "CREATE_AI_MODULE_CONFIG" : "UPDATE_AI_MODULE_CONFIG";
        String oldValues = "{ \"provider\": \"" + safe(previousProvider != null ? previousProvider.getName() : null)
                + "\", \"model\": \"" + safe(previousModel) + "\" }";
        String newValues = "{ \"provider\": \"" + safe(newProvider != null ? newProvider.getName() : null)
                + "\", \"model\": \"" + safe(newModel) + "\", \"enabled\": " + req.isEnabled()
                + ", \"executionMode\": \"" + cfg.getExecutionMode() + "\" }";
        String description = (isNew ? "AI module configured" : "AI module configuration changed")
                + " - Module: " + module.getName();
        auditService.logWithValues(user, action, "AI", "AiModuleConfig", moduleId,
                description, oldValues, newValues, ipAddress);

        ModuleConfigDto dto = toConfigDto(module, cfg);
        messagingTemplate.convertAndSend(TOPIC, dto);

        List<String> warnings = capabilityWarnings(moduleId, newProvider);
        if (warnings.isEmpty() && newProvider != null && !isUsableProvider(newProvider)) {
            warnings.add("The selected provider is not currently usable (no valid API key / offline). "
                    + "The module will fall back to safe local processing until a provider is configured.");
        }

        log.info("AI module '{}' config updated by {}: {} -> {}", moduleId,
                user != null ? user.getEmail() : "System", oldValues, newValues);
        return UpdateResult.builder()
                .config(dto)
                .warnings(warnings)
                .build();
    }

    private String safe(String v) {
        return v != null ? v : "";
    }

    /**
     * Persists the module enabled state (from the in-memory toggle) into the DB
     * so execution gating survives restarts.
     */
    @Transactional
    public void syncEnabled(String moduleId, boolean enabled) {
        AiModuleConfig cfg = cache.get(moduleId);
        if (cfg == null) {
            cfg = new AiModuleConfig();
            cfg.setModuleKey(moduleId);
        }
        cfg.setEnabled(enabled);
        configRepository.save(cfg);
        cache.put(moduleId, cfg);
    }

    /** Broadcasts the current module config over STOMP for realtime UI refresh. */
    public void broadcast(String moduleId) {
        getModuleConfig(moduleId).ifPresent(dto -> messagingTemplate.convertAndSend(TOPIC, dto));
    }

    /**
     * Live-fetches the available models for a module's assigned provider using
     * the same provider-specific fetch logic the AI Services page uses. Falls
     * back to the stored model name when the live fetch fails so the dropdown is
     * never empty for a configured provider.
     */
    public ModuleModelsDto fetchModuleModels(String moduleId) {
        AiStateManagementService.ModuleDto module = aiStateService.getModules().stream()
                .filter(m -> moduleId.equals(m.getId())).findFirst().orElse(null);
        if (module == null) {
            return null;
        }
        AiModuleConfig cfg = cache.get(moduleId);
        AiStateManagementService.ProviderDto provider = providerById(cfg != null ? cfg.getProviderId() : null);
        if (provider == null) {
            return ModuleModelsDto.builder()
                    .providerId(null)
                    .providerName(null)
                    .models(List.of())
                    .status("OFFLINE")
                    .message("No provider assigned to this module.")
                    .build();
        }

        List<String> models = new ArrayList<>();
        String status;
        String message;
        long start = System.currentTimeMillis();
        try {
            models = modelFetcher.fetch(provider);
            long latency = System.currentTimeMillis() - start;
            aiStateService.updateProviderHealth(provider.getId(), true, latency, "Models fetched");
            status = models.isEmpty() ? "OFFLINE" : "ONLINE";
            message = models.isEmpty()
                    ? "Provider returned no models. The assigned model can still be used."
                    : "Successfully fetched " + models.size() + " models from " + provider.getName() + ".";
        } catch (Exception e) {
            long latency = System.currentTimeMillis() - start;
            aiStateService.updateProviderHealth(provider.getId(), false, latency, "Health check failed");
            status = "OFFLINE";
            message = "Could not reach " + provider.getName() + ": " + e.getMessage();
        }
        return ModuleModelsDto.builder()
                .providerId(provider.getId())
                .providerName(provider.getName())
                .models(models)
                .status(status)
                .message(message)
                .build();
    }

    /** Broadcasts a provider registry change over STOMP for realtime UI refresh. */
    public void broadcastProviderChange(String type) {
        messagingTemplate.convertAndSend(TOPIC, Map.of(
                "type", type,
                "timestamp", System.currentTimeMillis()));
    }
}