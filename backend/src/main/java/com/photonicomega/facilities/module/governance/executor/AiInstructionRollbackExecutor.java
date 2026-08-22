package com.photonicomega.facilities.module.governance.executor;

import com.photonicomega.facilities.ai.ModuleInstructionService;
import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import com.photonicomega.facilities.module.governance.service.SensitiveActionExecutor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Rolls one module's AI instructions back to a version that module previously ran.
 *
 * <p>Gated because a module's instruction set is the closest thing this application
 * has to an unelected policy-maker. It decides what the assistant recommends to
 * every user on every screen in that module, and unlike a code change it takes
 * effect the instant it is saved - no build, no review, no diff anyone would notice.
 * "AI recommends, humans decide" only holds if the recommending was itself signed
 * off by a human.
 *
 * <p>The target is a <em>version</em>, not a body of text:
 * {@code targetId} is the module key and the payload carries
 * {@code {"version":"1.2.0"}}. That distinction is the point of this executor rather
 * than an implementation detail. If the replacement text travelled in the payload,
 * a "rollback" could contain anything the requester typed - brand new instructions
 * wearing the word rollback, approved by someone who reasonably read the label and
 * not the diff. Looking the content up from
 * {@link ModuleInstructionService}'s history instead makes the action provably a
 * return to a state this module actually ran before, and it makes the approval
 * meaningful without asking the approver to proofread a prompt.
 *
 * <p>Three refusals, each naming its fix:
 *
 * <ul>
 *   <li><b>Unknown module key.</b> The instruction cache is keyed by fixed module
 *       names; a typo would otherwise be a silent no-op reported as success.</li>
 *   <li><b>Missing version in the payload.</b> There is no sensible default -
 *       "the previous one" is ambiguous once more than one edit has happened.</li>
 *   <li><b>Version not in this module's history.</b> Checked here, before the call,
 *       so the request fails with the list of versions that do exist. {@code
 *       restoreVersion} returns {@code null} for both an unknown module and an
 *       unknown version, which the HTTP layer maps to a flat 404 - useless to an
 *       approver trying to work out which of the two went wrong.</li>
 * </ul>
 *
 * <p>Nothing is destroyed. {@code restoreVersion} republishes the old content as a
 * new version and pushes the outgoing content onto the history, so a mistaken
 * rollback is itself rollable-back. The one bounded loss is age: the history keeps
 * twenty entries per module, so each rollback moves the oldest surviving version one
 * step closer to falling off the end. The outgoing content is logged for that reason.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiInstructionRollbackExecutor implements SensitiveActionExecutor {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ModuleInstructionService moduleInstructionService;

    @Override
    public SensitiveAction supports() {
        return SensitiveAction.AI_INSTRUCTION_ROLLBACK;
    }

    @Override
    public String execute(ApprovalRequest request) {
        String moduleKey = normalizeModuleKey(request.getTargetId());
        String version = readVersionFromPayload(request);

        ModuleInstructionService.ModuleInstructionDto current = moduleInstructionService.get(moduleKey)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "'" + moduleKey + "' is not an AI module in this system, so the approved "
                                + "rollback has no target. Valid module keys: "
                                + availableModuleKeys() + "."));

        // Checked before the call, not after. restoreVersion cannot distinguish an
        // unknown module from an unknown version in its return value, and an approver
        // reading "not found" cannot act on it - whereas the list below tells them
        // exactly which version to ask for instead.
        List<String> history = current.getVersions() == null ? List.of()
                : current.getVersions().stream()
                        .map(ModuleInstructionService.InstructionVersion::getVersion)
                        .collect(Collectors.toList());

        if (!history.contains(version)) {
            throw new BusinessRuleViolationException(
                    "Module '" + moduleKey + "' has no version " + version + " in its history, so "
                            + "there is nothing to roll back to. It is currently on v"
                            + current.getVersion() + (history.isEmpty()
                            ? " and has never been edited, so no earlier version exists."
                            : " and the versions available to restore are: "
                                    + String.join(", ", history) + ".")
                            + " Note the history keeps only the twenty most recent versions per "
                            + "module; anything older has already been discarded.");
        }

        String outgoing = current.getContent();

        // Logged before the swap. The history preserves the outgoing content too, but
        // only for another nineteen edits, and this is the action most likely to be
        // examined long after the fact.
        log.warn("Approval {} rolling module '{}' AI instructions from v{} back to v{}, "
                        + "requested by {}. Outgoing content ({} chars) follows between markers:"
                        + "\n---BEGIN OUTGOING AI INSTRUCTIONS ({} v{})---\n{}\n"
                        + "---END OUTGOING AI INSTRUCTIONS---",
                request.getId(), moduleKey, current.getVersion(), version,
                request.getRequestedByEmail(), outgoing == null ? 0 : outgoing.length(),
                moduleKey, current.getVersion(), outgoing);

        ModuleInstructionService.ModuleInstructionDto restored =
                moduleInstructionService.restoreVersion(moduleKey, version, executorIdentity(request));

        if (restored == null) {
            // Unreachable given the two checks above, but this is the last line of a
            // gated action: failing loudly is better than reporting a success the
            // approvers would never be able to verify.
            throw new BusinessRuleViolationException(
                    "Rolling module '" + moduleKey + "' back to v" + version + " was refused by the "
                            + "instruction service even though the module and version both exist. "
                            + "Nothing was changed. This needs investigating before the approval is "
                            + "retried.");
        }

        return "Module '" + moduleKey + "' (" + current.getName() + ") AI instructions rolled back to "
                + "the content of v" + version + " under approval " + request.getId()
                + ", published as v" + restored.getVersion() + ". The instructions it was running (v"
                + current.getVersion() + ", " + (outgoing == null ? 0 : outgoing.length())
                + " chars) were pushed onto the history, so this rollback can itself be rolled back. "
                + "Takes effect on the next AI request for this module - no restart needed, and any "
                + "recommendation already on a user's screen was produced by the old instructions.";
    }

    /**
     * The module key, trimmed and lower-cased.
     *
     * <p>Deliberately forgiving about case and whitespace, and deliberately not
     * forgiving about anything else. A rejected target here fails <em>after</em> an
     * approver has already signed, so a trailing space should not cost a second
     * signature - but silently guessing at a near-miss key would apply the rollback
     * to a module nobody approved.
     */
    private static String normalizeModuleKey(String targetId) {
        if (targetId == null || targetId.isBlank()) {
            throw new BusinessRuleViolationException(
                    "The approval names no AI module, so there is nothing to roll back. The target "
                            + "id must be the module key.");
        }
        return targetId.trim().toLowerCase();
    }

    /**
     * Pulls the version out of the payload, accepting {@code {"version":"1.2.0"}},
     * {@code {"targetVersion":"1.2.0"}}, or a bare JSON string.
     */
    private String readVersionFromPayload(ApprovalRequest request) {
        String payload = request.getPayloadJson();
        if (payload == null || payload.isBlank()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " carries no payload, so it does not say which "
                            + "version to roll back to. There is no safe default: once a module has "
                            + "been edited more than once, \"the previous version\" is ambiguous. "
                            + "Expected {\"version\":\"1.2.0\"}.");
        }

        String candidate = null;
        try {
            JsonNode node = MAPPER.readTree(payload);
            for (String field : new String[]{"version", "targetVersion", "restoreVersion"}) {
                if (node.hasNonNull(field) && node.get(field).isTextual()) {
                    candidate = node.get(field).asText();
                    break;
                }
            }
            if (candidate == null && node.isTextual()) {
                candidate = node.asText();
            }
        } catch (Exception notJson) {
            // A bare version string is a reasonable thing for a caller to send.
            candidate = payload;
        }

        if (candidate == null || candidate.isBlank()) {
            throw new BusinessRuleViolationException(
                    "Approval " + request.getId() + " has a payload but no version in it. Expected "
                            + "{\"version\":\"1.2.0\"}.");
        }
        return candidate.trim();
    }

    /**
     * Who the instruction history records as having made the change.
     *
     * <p>The requester's address plus the approval id, rather than the requester
     * alone: the history is what an auditor reads first, and "this was changed by
     * an administrator" invites the wrong conclusion when the truthful answer is
     * "an administrator asked and someone else authorised it".
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
