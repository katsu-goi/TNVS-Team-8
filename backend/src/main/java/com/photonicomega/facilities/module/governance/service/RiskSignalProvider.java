package com.photonicomega.facilities.module.governance.service;

import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;

import java.util.List;

/**
 * Contributes evidence about a proposed destructive act.
 *
 * <p>Each module implements this for the targets it owns, so the risk advisor
 * never needs a compile-time dependency on every module in the application.
 *
 * <p>Signals are <em>facts</em>, not opinions - "this document's retention window
 * has 412 days left", not "this looks risky". Turning facts into a recommendation
 * is the advisor's job, and turning a recommendation into a decision is a
 * human's.
 */
public interface RiskSignalProvider {

    /** A single piece of evidence about the target. */
    record Signal(Severity severity, String finding) {

        public enum Severity {
            /** Nothing of concern; recorded so the approver can see it was checked. */
            CLEAR,
            /** Worth mentioning. */
            NOTE,
            /** A specific concern. */
            CONCERN,
            /** A hard reason to refuse, e.g. an active legal hold. */
            DISQUALIFYING
        }

        public static Signal clear(String finding) {
            return new Signal(Severity.CLEAR, finding);
        }

        public static Signal note(String finding) {
            return new Signal(Severity.NOTE, finding);
        }

        public static Signal concern(String finding) {
            return new Signal(Severity.CONCERN, finding);
        }

        public static Signal disqualifying(String finding) {
            return new Signal(Severity.DISQUALIFYING, finding);
        }
    }

    /** Whether this provider has anything to say about the given act. */
    boolean supports(SensitiveAction action, String targetType);

    /**
     * Gather evidence. Must not throw: a provider that cannot reach its data
     * returns a NOTE saying so, because an advisor that silently drops a failed
     * legal-hold check would report "no concerns found" when it in fact found
     * nothing out.
     */
    List<Signal> gather(SensitiveAction action, String targetType, String targetId, User requester);
}
