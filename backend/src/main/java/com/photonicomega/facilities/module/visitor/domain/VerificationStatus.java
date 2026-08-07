package com.photonicomega.facilities.module.visitor.domain;

/**
 * Outcome of a verification attempt. {@code VERIFIED} means the check ran to
 * completion - it does <em>not</em> mean the visitor is cleared; that is
 * {@link WatchlistStatus}.
 */
public enum VerificationStatus {
    PENDING,
    VERIFIED,
    REJECTED,
    ERROR
}
