package com.photonicomega.facilities.module.ai.domain;

/** Terminal status of a single AI request, as recorded in the immutable audit log. */
public enum AiRequestStatus {
    SUCCESS,
    FAILED,
    FALLBACK_USED,
    BLOCKED_BY_POLICY,
    MANUAL_REVIEW_REQUIRED
}
