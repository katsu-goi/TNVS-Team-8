package com.photonicomega.facilities.module.governance.service;

import com.photonicomega.facilities.ai.AiChatGateway;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.governance.domain.AiRiskLevel;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Produces an advisory risk verdict for a proposed destructive act.
 *
 * <h2>AI recommends, a human decides, the system records</h2>
 *
 * <p>Nothing this class returns can stop a request or complete one. It changes
 * only what the approver reads before choosing. {@link AiRiskLevel#BLOCK} is a
 * recommendation to refuse; a human may approve anyway, and
 * {@code ApprovalRequest.approvedAgainstAiAdvice} then records that they did.
 *
 * <h2>Why the level is computed from rules, not from the model</h2>
 *
 * <p>The severity comes entirely from deterministic {@link RiskSignalProvider}
 * evidence. The language model is used only to write the explanation around
 * those findings. Two reasons:
 *
 * <ul>
 *   <li>An unreachable or slow model must never be able to soften a verdict. If
 *       the model decided the level, an outage would quietly downgrade an active
 *       legal hold to "no concerns" - the exact failure that looks perfect in a
 *       demo, because in a demo the model is always up.</li>
 *   <li>A model asked "is this deletion risky?" will produce a fluent answer
 *       whether or not it has the facts. Retention dates and legal holds are
 *       lookups, and a lookup that is wrong 5% of the time is not an input to
 *       destroying company records.</li>
 * </ul>
 *
 * <p>When no evidence can be gathered at all the verdict is
 * {@link AiRiskLevel#UNKNOWN}, never {@link AiRiskLevel#LOW}. Absence of
 * evidence is not evidence of safety, and the approver is told the difference.
 */
@Service
@Slf4j
public class ApprovalRiskAdvisor {

    private static final String AI_MODULE_KEY = "governance-approvals";

    private final List<RiskSignalProvider> signalProviders;
    private final AiChatGateway aiChatGateway;

    public ApprovalRiskAdvisor(List<RiskSignalProvider> signalProviders, AiChatGateway aiChatGateway) {
        this.signalProviders = signalProviders;
        this.aiChatGateway = aiChatGateway;
    }

    /** The advisory verdict shown to approvers. */
    public record Advice(AiRiskLevel level, String rationale, List<RiskSignalProvider.Signal> signals) {
    }

    public Advice assess(SensitiveAction action, String targetType, String targetId,
                         String targetLabel, String justification, User requester) {

        List<RiskSignalProvider.Signal> signals = new ArrayList<>();
        for (RiskSignalProvider provider : signalProviders) {
            if (!provider.supports(action, targetType)) {
                continue;
            }
            try {
                List<RiskSignalProvider.Signal> gathered =
                        provider.gather(action, targetType, targetId, requester);
                if (gathered != null) {
                    signals.addAll(gathered);
                }
            } catch (RuntimeException ex) {
                // A provider that blew up has not cleared the target. Say so
                // rather than omitting it, so "no concerns" cannot mean "the
                // legal-hold check crashed".
                log.warn("Risk signal provider {} failed for {} {}: {}",
                        provider.getClass().getSimpleName(), targetType, targetId, ex.getMessage());
                signals.add(RiskSignalProvider.Signal.note(
                        "A pre-approval check could not be completed ("
                                + provider.getClass().getSimpleName() + "), so this item is not cleared."));
            }
        }

        AiRiskLevel level = severityOf(signals);
        String rationale = narrate(action, targetLabel, justification, signals, level);
        return new Advice(level, rationale, signals);
    }

    /**
     * Highest severity wins. One disqualifying finding is not averaged away by
     * nine clear ones - a document under legal hold is under legal hold no matter
     * how routine everything else about it looks.
     */
    private AiRiskLevel severityOf(List<RiskSignalProvider.Signal> signals) {
        if (signals.isEmpty()) {
            return AiRiskLevel.UNKNOWN;
        }
        boolean anyDisqualifying = signals.stream()
                .anyMatch(s -> s.severity() == RiskSignalProvider.Signal.Severity.DISQUALIFYING);
        if (anyDisqualifying) {
            return AiRiskLevel.BLOCK;
        }
        long concerns = signals.stream()
                .filter(s -> s.severity() == RiskSignalProvider.Signal.Severity.CONCERN)
                .count();
        if (concerns >= 2) {
            return AiRiskLevel.HIGH;
        }
        if (concerns == 1) {
            return AiRiskLevel.MEDIUM;
        }
        boolean anyNote = signals.stream()
                .anyMatch(s -> s.severity() == RiskSignalProvider.Signal.Severity.NOTE);
        return anyNote ? AiRiskLevel.MEDIUM : AiRiskLevel.LOW;
    }

    /**
     * Builds the text the approver reads. The deterministic findings are always
     * included verbatim; the model is asked only to add a short plain-language
     * summary, and its absence costs nothing but polish.
     */
    private String narrate(SensitiveAction action, String targetLabel, String justification,
                           List<RiskSignalProvider.Signal> signals, AiRiskLevel level) {

        String findings = signals.isEmpty()
                ? "No automated checks were able to evaluate this target, so it is not cleared - "
                + "review it manually."
                : signals.stream()
                .map(s -> "- [" + s.severity() + "] " + s.finding())
                .collect(Collectors.joining("\n"));

        String deterministic = "Recommendation: " + level + "\n"
                + "Requested act: " + action.getLabel() + " on '" + targetLabel + "'\n"
                + "Why this act is gated: " + action.getRationale() + "\n"
                + "Automated findings:\n" + findings;

        String prompt = """
                You are advising a facilities governance approver who is about to decide \
                whether to authorise an irreversible action. You do not decide. Write at \
                most three sentences of plain-language summary of the findings below, aimed \
                at a busy approver. Do not invent facts that are not in the findings. If the \
                findings contain a disqualifying item, say plainly that you recommend \
                refusing and name the item.

                Act: %s
                Target: %s
                Requester's stated justification: %s
                Findings:
                %s
                """.formatted(action.getLabel(), targetLabel, justification, findings);

        String summary = aiChatGateway.chat(
                "You are a records-governance risk advisor. You recommend; humans decide.",
                prompt, null, AI_MODULE_KEY);

        if (summary == null || summary.isBlank()) {
            return deterministic;
        }
        return deterministic + "\n\nAdvisor summary: " + summary.trim();
    }
}
