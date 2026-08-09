package com.photonicomega.facilities.module.documents.domain;

/**
 * The kind of grantee a {@code document_grants} row applies to.
 */
public enum DocumentGranteeType {
    /** Grant applies to a single user, matched by email in {@code grantee_key}. */
    USER,
    /** Grant applies to every user holding the role named in {@code grantee_key}. */
    ROLE
}
