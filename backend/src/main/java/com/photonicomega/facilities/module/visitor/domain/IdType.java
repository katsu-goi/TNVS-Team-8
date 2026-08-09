package com.photonicomega.facilities.module.visitor.domain;

/**
 * Government ID presented at the lobby. Drives which heuristic format
 * check {@code VisitorVerificationService} applies.
 */
public enum IdType {
    DRIVERS_LICENSE,
    UMID,
    PASSPORT,
    NATIONAL_ID,
    OTHER
}
