package com.photonicomega.facilities.module.governance.domain;

/**
 * Canonical role names used by the governance layer.
 *
 * <p>Kept as constants in one place so the approval policy
 * ({@link SensitiveAction}) and the role seeding can never drift apart: a typo
 * in a role name would otherwise silently produce an action that nobody is
 * eligible to approve, which fails closed but is invisible.
 */
public final class GovernanceRoles {

    // --- System administration ---
    public static final String SUPER_ADMIN = "SUPER_ADMIN";
    public static final String SYSTEM_ADMINISTRATOR = "SYSTEM_ADMINISTRATOR";
    public static final String SECURITY_OFFICER = "SECURITY_OFFICER";

    // --- Facilities ---
    public static final String FACILITIES_DIRECTOR = "FACILITIES_DIRECTOR";
    public static final String FACILITIES_MANAGER = "FACILITIES_MANAGER";
    public static final String FACILITIES_OFFICER = "FACILITIES_OFFICER";
    public static final String MAINTENANCE_SUPERVISOR = "MAINTENANCE_SUPERVISOR";

    // --- Records & compliance ---
    public static final String RECORDS_OFFICER = "RECORDS_OFFICER";
    public static final String COMPLIANCE_MANAGER = "COMPLIANCE_MANAGER";
    public static final String COMPLIANCE_OFFICER = "COMPLIANCE_OFFICER";
    public static final String DATA_PROTECTION_OFFICER = "DATA_PROTECTION_OFFICER";

    // --- Legal & contracts ---
    public static final String LEGAL_COUNSEL = "LEGAL_COUNSEL";
    public static final String LEGAL_OFFICER = "LEGAL_OFFICER";
    public static final String CONTRACT_OFFICER = "CONTRACT_OFFICER";

    // --- Requesters ---
    public static final String DEPARTMENT_HEAD = "DEPARTMENT_HEAD";
    public static final String EMPLOYEE = "EMPLOYEE";

    private GovernanceRoles() {
    }
}
