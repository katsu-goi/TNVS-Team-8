package com.photonicomega.facilities.module.governance.domain;

/**
 * The AI's advisory verdict on a pending destructive request.
 *
 * <p>Advisory is the whole point: the AI recommends, a human decides, the system
 * records. No value here can approve, reject, or block a request - it only
 * changes what the approver is told before they choose. {@link #BLOCK} is
 * therefore named for what it recommends, not for what it does.
 */
public enum AiRiskLevel {

    /** Routine. Matches an established pattern with no conflicting signals. */
    LOW,

    /** Worth a second look, but nothing disqualifying found. */
    MEDIUM,

    /** Specific conflicting signal found - named in the rationale. */
    HIGH,

    /** The AI recommends refusing. A human may still approve, and it is recorded that they did. */
    BLOCK,

    /** The AI could not form a view. Never treated as safe. */
    UNKNOWN
}
