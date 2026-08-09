package com.photonicomega.facilities.module.documents.domain;

/**
 * Level of access granted to a {@code document_grants} row.
 */
public enum DocumentGrantAccessLevel {
    /** Metadata visibility only; the stored file cannot be downloaded. */
    VIEW,
    /** Metadata visibility plus file download. Implies VIEW. */
    DOWNLOAD
}
