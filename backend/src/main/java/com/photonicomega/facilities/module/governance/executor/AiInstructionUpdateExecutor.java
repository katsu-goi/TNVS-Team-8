package com.photonicomega.facilities.module.governance.executor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.photonicomega.facilities.ai.AiStateManagementService;
import com.photonicomega.facilities.ai.ModuleInstructionService;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.stream.Collectors;

/**
 * Writes AI instruction text once the change has been signed off.
 *
 * <p>This is the executor the rollback executor beside it always implied. Rolling a
 * module back to v1.2.0 was gated from the start because the word "restore" reads as
 * dangerous; typing the same text into the editor and pressing save was not gated at
 * all. That is the wrong way round if it is going to be either: the rollback can only
 * ever reach a state the module already ran and an approver could look up, while the
 * PUT can set the instructions to anything at all. Governing the narrow path and
 * leaving the general one open is worse than governing neither, because the gate on
 * the narrow path reads as coverage.
 *
 * <h2>Three ways to change what the assistant says, one action</h2>
 *
 * <p>They are one {@link SensitiveAction} because they are one act reached three
 * ways, and an approver deciding on any of them is answering the same question -
 * should the assistant start saying something different tomorrow:
 *
 * <ul>
 *   <li>{@code CONTENT} - replace one module's instruction text.</li>
 *   <li>{@code GLOBAL_PROMPT} - replace the system prompt every module inherits.</li>
 *   <li>{@code TOGGLE} - switch a module's instruction set off, so it falls back to
 *       that global prompt, or back on.</li>
 * </ul>
 *
 * <p>The toggle belongs here and not among the exemptions for a reason that is easy
 * to get backwards. Switching a module's <em>AI</em> off is a fail-safe act and is
 * deliberately not gated - an assistant that says nothing cannot say anything wrong,
 * and during an incident the person silencing it should not first have to find a
 * second signature. Switching a module's <em>instructions</em> off does the opposite:
 * the assistant carries on advising, with its module-specific guardrails removed.
 * That is a change to the advice, not an end to it.
 *
 * <h2>Why the toggle payload carries a state and not an instruction to flip</h2>
 *
 * <p>{@code ModuleInstructionService.toggle} inverts whatever it finds. An approval
 * raised while the instructions were on, approved twenty minutes later after someone
 * else had already turned them off, would then turn them back on - the exact opposite
 * of what was approved, reported as a success. So the payload records the intended
 * resulting state, this executor compares it against the live one, and a request whose
 * end state already holds does nothing and says so.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiInstructionUpdateExecutor implements SensitiveActionExecutor {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Payload discriminators. Mirrored in {@code AiController} where payloads are built. */
    static final String KIND_CONTENT = "CONTENT";
    static final String KIND_TOGGLE = "TOGGLE";
    static final String KIND_GLOBAL_PROMPT = "GLOBAL_PROMPT";

    private final ModuleInstructionService moduleInstructionService;
    private final AiStateManagementService aiStateService;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.AI_INSTRUCTION_UPDATE;
    }

    @Override
    public String execute(ApprovalRequest request) {
        JsonNode payload = readPayload(request);
        String kind = payload.path("kind").asText("");

        return switch (kind) {
            case KIND_CONTENT -> applyContent(request, payload);
            case KIND_TOGGLE -> applyToggle(request, payload);
            case KIND_GLOBAL_PROMPT -> applyGlobalPrompt(request, payload);
            default -> throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " does not say what kind of AI instruction change "
                            + "it is" + (kind.isBlank() ? "" : " (found kind '" + kind + "')")
                            + ", so it cannot be carried out. Expected one of " + KIND_CONTENT + ", "
                            + KIND_TOGGLE + " or " + KIND_GLOBAL_PROMPT + ". Nothing was changed.");
        };
    }

    // ------------------------------------------------------------------
    // CONTENT - replace one module's instruction text.
    // ------------------------------------------------------------------

    private String applyContent(ApprovalRequest request, JsonNode payload) {
        String moduleKey = moduleKeyOf(request);
        ModuleInstructionService.ModuleInstructionDto current = requireModule(moduleKey, "update");

        if (!payload.hasNonNull("content") || !payload.get("content").isTextual()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " is a content change for module '" + moduleKey
                            + "' but carries no instruction text, and there is no safe default - "
                            + "an empty instruction set is a silent change to what the assistant "
                            + "says, not a no-op. Nothing was changed.");
        }
        String content = payload.get("content").asText();
        String changeSummary = payload.path("changeSummary").asText(null);

        String outgoing = current.getContent();

        // Logged before the write, in full and between markers, for the same reason the
        // rollback executor does it: the history keeps twenty versions per module and
        // lives in memory, and this is the change most likely to be examined long after
        // the twentieth edit has pushed it off the end.
        log.warn("Approval {} replacing module '{}' AI instructions (v{} -> new version), requested "
                        + "by {}. Outgoing content ({} chars) follows between markers:"
                        + "\n---BEGIN OUTGOING AI INSTRUCTIONS ({} v{})---\n{}\n"
                        + "---END OUTGOING AI INSTRUCTIONS---",
                request.getId(), moduleKey, current.getVersion(), request.getRequestedByEmail(),
                outgoing == null ? 0 : outgoing.length(), moduleKey, current.getVersion(), outgoing);

        ModuleInstructionService.ModuleInstructionDto updated = moduleInstructionService.updateContent(
                moduleKey, content, changeSummary, executorIdentity(request));

        if (updated == null) {
            throw new BusinessRuleViolationException(
                    "The instruction service refused the approved update to module '" + moduleKey
                            + "' even though the module exists. Nothing was changed. This needs "
                            + "investigating before the approval is retried.");
        }

        return "Module '" + moduleKey + "' (" + current.getName() + ") AI instructions replaced under "
                + "approval " + request.getId() + ", published as v" + updated.getVersion()
                + ". The previous text (v" + current.getVersion() + ", "
                + (outgoing == null ? 0 : outgoing.length()) + " chars) was pushed onto the history, "
                + "so this change can be rolled back. Takes effect on the next AI request for this "
                + "module - any recommendation already on a user's screen came from the old text.";
    }

    // ------------------------------------------------------------------
    // TOGGLE - switch a module's instruction set on or off.
    // ------------------------------------------------------------------

    private String applyToggle(ApprovalRequest request, JsonNode payload) {
        String moduleKey = moduleKeyOf(request);
        ModuleInstructionService.ModuleInstructionDto current = requireModule(moduleKey, "enable or disable");

        if (!payload.hasNonNull("enabled") || !payload.get("enabled").isBoolean()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " is a toggle for module '" + moduleKey + "' but "
                            + "does not say which way. It has to name the state it wants rather than "
                            + "asking for a flip: the live state can change between the request and "
                            + "the approval, and a flip would then produce the opposite of what was "
                            + "signed for. Expected {\"kind\":\"TOGGLE\",\"enabled\":true|false}.");
        }
        boolean intended = payload.get("enabled").asBoolean();

        if (current.isEnabled() == intended) {
            // Not a failure. The approved end state is the state the system is in, and
            // calling toggle() here would move it away from what was approved.
            return "Module '" + moduleKey + "' (" + current.getName() + ") AI instructions are already "
                    + (intended ? "enabled" : "disabled") + ", which is what approval " + request.getId()
                    + " asked for, so nothing was changed. Somebody reached this state by another "
                    + "route between the request and the approval.";
        }

        ModuleInstructionService.ModuleInstructionDto updated =
                moduleInstructionService.toggle(moduleKey, executorIdentity(request));

        if (updated == null || updated.isEnabled() != intended) {
            throw new BusinessRuleViolationException(
                    "Toggling module '" + moduleKey + "' instructions to "
                            + (intended ? "enabled" : "disabled") + " did not produce that state"
                            + (updated == null ? " - the instruction service returned nothing."
                            : " - it is now " + (updated.isEnabled() ? "enabled" : "disabled") + ".")
                            + " Something changed it concurrently. Check the module before retrying.");
        }

        log.warn("Approval {} {} module '{}' AI instructions, requested by {}",
                request.getId(), intended ? "enabled" : "disabled", moduleKey,
                request.getRequestedByEmail());

        return "Module '" + moduleKey + "' (" + current.getName() + ") AI instructions "
                + (intended ? "enabled" : "disabled") + " under approval " + request.getId()
                + ", recorded as v" + updated.getVersion() + ". "
                + (intended
                ? "The module's own guardrails apply again from the next AI request."
                : "The assistant carries on answering for this module, but from the global system "
                        + "prompt alone - the module-specific guardrails no longer apply.");
    }

    // ------------------------------------------------------------------
    // GLOBAL_PROMPT - replace the prompt every module inherits.
    // ------------------------------------------------------------------

    private String applyGlobalPrompt(ApprovalRequest request, JsonNode payload) {
        if (!payload.hasNonNull("prompt") || !payload.get("prompt").isTextual()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " is a system prompt change but carries no prompt "
                            + "text. Nothing was changed.");
        }
        String prompt = payload.get("prompt").asText();
        String outgoing = aiStateService.getSystemPrompt();

        // The global prompt has no version history at all - setSystemPrompt overwrites a
        // single field - so this log line is the only record of what it used to say.
        log.warn("Approval {} replacing the global AI system prompt, requested by {}. Outgoing "
                        + "prompt ({} chars) follows between markers - note it has no version history, "
                        + "so this line is the only copy:"
                        + "\n---BEGIN OUTGOING AI SYSTEM PROMPT---\n{}\n"
                        + "---END OUTGOING AI SYSTEM PROMPT---",
                request.getId(), request.getRequestedByEmail(),
                outgoing == null ? 0 : outgoing.length(), outgoing);

        aiStateService.setSystemPrompt(prompt);

        return "The global AI system prompt was replaced under approval " + request.getId()
                + " (" + (outgoing == null ? 0 : outgoing.length()) + " chars -> " + prompt.length()
                + " chars). It applies to every module that does not have its own instructions "
                + "enabled, from the next AI request. The prompt it replaced is not kept anywhere "
                + "the console can show it; it is in the application log against this approval id.";
    }

    // ------------------------------------------------------------------

    private JsonNode readPayload(ApprovalRequest request) {
        String payload = request.getPayloadJson();
        if (payload == null || payload.isBlank()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " carries no payload, so it does not say what the "
                            + "AI instructions should become. Nothing was changed.");
        }
        try {
            JsonNode node = MAPPER.readTree(payload);
            if (node == null || !node.isObject()) {
                throw new BusinessRuleViolationException(
                        "Approval " + request.getId() + " has a payload that is not a JSON object, so "
                                + "the requested instruction text cannot be read from it. Nothing was "
                                + "changed.");
            }
            return node;
        } catch (BusinessRuleViolationException rethrow) {
            throw rethrow;
        } catch (Exception notJson) {
            // Never fall back to treating the raw payload as instruction text. Instruction
            // bodies contain quotes, braces and newlines, so a payload that fails to parse
            // is far more likely to be a truncated or mangled one than a bare string - and
            // writing it verbatim would install whatever survived the mangling as company
            // policy, under a signature given for something else.
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " has a payload that is not valid JSON ("
                            + notJson.getMessage() + "). It is not being treated as raw instruction "
                            + "text, because that would install a corrupted payload as the "
                            + "assistant's instructions. Nothing was changed; raise the request again.");
        }
    }

    private static String moduleKeyOf(ApprovalRequest request) {
        String targetId = request.getTargetId();
        if (targetId == null || targetId.isBlank()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " names no AI module, so there is nothing to "
                            + "change. The target id must be the module key.");
        }
        return targetId.trim().toLowerCase();
    }

    private ModuleInstructionService.ModuleInstructionDto requireModule(String moduleKey, String verb) {
        return moduleInstructionService.get(moduleKey)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "'" + moduleKey + "' is not an AI module in this system, so the approved "
                                + "request to " + verb + " its instructions has no target. Valid module "
                                + "keys: " + availableModuleKeys() + "."));
    }

    /**
     * Who the instruction history records as having made the change.
     *
     * <p>Requester plus approval id, matching {@code AiInstructionRollbackExecutor}:
     * the history is what an auditor reads first, and naming the administrator alone
     * invites the conclusion that they did this unilaterally when the truthful answer
     * is that they asked and somebody else authorised it.
     */
    private static String executorIdentity(ApprovalRequest request) {
        String requester = request.getRequestedByEmail() == null
                ? "unknown requester" : request.getRequestedByEmail();
        return requester + " (approval " + request.getId() + ")";
    }

    private String availableModuleKeys() {
        return moduleInstructionService.listAll().stream()
                .map(ModuleInstructionService.ModuleInstructionDto::getModuleKey)
                .sorted()
                .collect(Collectors.joining(", "));
    }
}
