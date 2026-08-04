package com.photonicomega.facilities.module.ai.domain;

/** Observed health of an AI provider connection. UNKNOWN is the honest default. */
public enum AiProviderStatus {
    HEALTHY,
    DEGRADED,
    UNAVAILABLE,
    DISABLED,
    UNKNOWN
}
