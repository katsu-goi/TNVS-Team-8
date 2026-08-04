package com.photonicomega.facilities.module.ai.domain;

/** Human-in-the-loop decision recorded against an AI request. */
public enum AiHumanOutcome {
    ACCEPTED,
    EDITED,
    REJECTED,
    PENDING_REVIEW
}
