package com.photonicomega.facilities.ai;

import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Context-aware AI assistant. Composes the system context in strict priority
 * order (1. Global, 2. Active module, 3. Related modules, 4. Role/Permissions,
 * 5. Live backend data) and appends the user request. Always returns a result -
 * when no LLM provider is reachable it returns a graceful fallback that
 * surfaces the composed context instead of fabricating an answer.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AiChatService {

    private final AiStateManagementService aiStateService;
    private final ModuleInstructionService moduleInstructionService;
    private final ModuleDataContextService dataContextService;
    private final ModuleAiConfigService moduleAiConfigService;
    private final AiChatGateway aiChatGateway;

    public static final String MODULE_GLOBAL = "global";

    @Data
    @Builder
    public static class ChatRequest {
        private String message;
        private String module;
        private List<String> relatedModules;
        private String route;
    }

    @Data
    @Builder
    public static class ChatResponse {
        private String reply;
        private String module;
        private String moduleName;
        private boolean moduleApplied;
        private boolean liveLlm;
        private long latencyMs;
        private long tokensUsed;
        private String composedContext;
        private String modelUsed;
        private String provider;
        private boolean fallbackUsed;
    }

    public ChatResponse chat(ChatRequest request, Set<String> authorities, String user) {
        long start = System.currentTimeMillis();

        String message = request.getMessage() != null ? request.getMessage().trim() : "";

        // Resolve the active module: explicit module > route detection > global.
        String module = request.getModule();
        if (module == null || module.isBlank()) {
            module = request.getRoute() != null && !request.getRoute().isBlank()
                    ? moduleInstructionService.detectModule(request.getRoute()).orElse(MODULE_GLOBAL)
                    : MODULE_GLOBAL;
        }
        if (!moduleInstructionService.isValidModule(module)) {
            module = MODULE_GLOBAL;
        }

        boolean moduleApplied = moduleInstructionService.getActiveContent(module).isPresent();
        String moduleName = moduleInstructionService.get(module).map(ModuleInstructionService.ModuleInstructionDto::getName)
                .orElse("Global");

        // 1. Global
        StringBuilder context = new StringBuilder();
        context.append(aiStateService.getSystemPrompt()).append("\n\n");

        // 2. Active module instructions (fallback: global-only when disabled/missing)
        String activeContent = moduleInstructionService.getActiveContent(module).orElse(null);
        if (activeContent != null) {
            context.append("## ACTIVE MODULE INSTRUCTIONS (").append(moduleName).append(")\n");
            context.append(activeContent).append("\n\n");
        }

        // 3. Related modules (explicit cross-module scope)
        List<String> related = new ArrayList<>();
        if (request.getRelatedModules() != null) {
            for (String rel : request.getRelatedModules()) {
                if (rel != null && !rel.isBlank() && !rel.equals(module)
                        && moduleInstructionService.getActiveContent(rel).isPresent()) {
                    related.add(rel);
                }
            }
        }
        if (!related.isEmpty()) {
            context.append("## RELATED MODULE INSTRUCTIONS\n");
            for (String rel : related) {
                context.append("### ").append(rel).append("\n")
                        .append(moduleInstructionService.getActiveContent(rel).orElse(""))
                        .append("\n\n");
            }
        }

        // 4. Role / Permissions (RBAC-aware behavior)
        context.append("## CALLER ROLE / PERMISSIONS\n");
        if (authorities == null || authorities.isEmpty()) {
            context.append("(unauthenticated - treat as no privileges)\n");
        } else {
            context.append(String.join(", ", authorities)).append("\n");
        }
        context.append("Never grant, imply, or suggest privileges outside this list.\n\n");

        // 5. Live backend data context (real data only)
        String dataContext = dataContextService.dataContext(module).orElse(null);
        if (dataContext != null) {
            context.append("## LIVE SYSTEM DATA (REAL, NOT FABRICATED)\n")
                    .append(dataContext).append("\n");
        }

        // 6. Assigned model configuration (routed per-module)
        String aiModuleId = moduleAiConfigService.aiModuleForInstruction(module).orElse(null);
        ModuleAiConfigService.ExecutionTarget target = aiModuleId != null
                ? moduleAiConfigService.resolveExecution(aiModuleId) : null;
        if (target != null && target.getModel() != null) {
            context.append("## ASSIGNED AI MODEL (CONFIGURED BY ADMIN)\n")
                    .append("Module model: ").append(target.getModel()).append("\n")
                    .append("Provider: ").append(target.getProviderName() != null ? target.getProviderName() : "default").append("\n");
            if (target.isFallbackUsed()) {
                context.append("Note: the assigned model was unavailable; the configured fallback model was used.\n");
            }
            context.append("\n");
        }

        String composedContext = context.toString().trim();
        String fallbackReply = buildFallbackReply(module, moduleName, message);

        String reply = aiChatGateway.chat(composedContext, message, fallbackReply, aiModuleId);
        boolean liveLlm = !fallbackReply.equals(reply);

        long latency = System.currentTimeMillis() - start;
        long tokens = (message.length() / 4) + 180;

        aiStateService.addLog(
                "AI Context Chat",
                target != null ? target.getProviderName() : null,
                "context_chat_" + module,
                liveLlm ? "SUCCESS" : "FAILED",
                latency,
                tokens,
                user != null ? user : "System Administrator"
        );

        return ChatResponse.builder()
                .reply(reply)
                .module(module)
                .moduleName(moduleName)
                .moduleApplied(moduleApplied)
                .liveLlm(liveLlm)
                .latencyMs(latency)
                .tokensUsed(tokens)
                .composedContext(composedContext)
                .modelUsed(target != null ? target.getModel() : null)
                .provider(target != null ? target.getProviderName() : null)
                .fallbackUsed(target != null && target.isFallbackUsed())
                .build();
    }

    private String buildFallbackReply(String module, String moduleName, String message) {
        StringBuilder sb = new StringBuilder();
        sb.append("Live AI generation is not currently available - no AI provider with a valid API key is configured. ");
        sb.append("The composed system context for module \"").append(moduleName).append("\" (").append(module)
                .append(") is ready and would ground the assistant in the real system data and role permissions above. ");
        sb.append("Configure an AI provider in AI Services to receive a live response.");
        if (message != null && !message.isBlank()) {
            sb.append("\n\nPending user request: ").append(message);
        }
        return sb.toString();
    }
}