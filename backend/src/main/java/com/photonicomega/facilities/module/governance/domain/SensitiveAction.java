package com.photonicomega.facilities.module.governance.domain;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;

import static com.photonicomega.facilities.module.governance.domain.GovernanceRoles.*;

/**
 * The catalogue of irreversible acts, and who is allowed to ask for each one
 * versus who is allowed to authorise it.
 *
 * <p>This enum <em>is</em> the authorization policy for destructive change. It
 * exists because the alternative - an ad-hoc permission check inside each of
 * the fifteen destructive endpoints - fails the moment someone adds a
 * sixteenth and forgets. Every destructive path in the application routes
 * through {@code ApprovalGateService}, which reads its rules from here.
 *
 * <h2>Two design rules that are deliberately non-negotiable</h2>
 *
 * <p><b>1. Requesting and approving are different capabilities.</b> Holding an
 * approver role does not let you approve your own request - that is enforced
 * separately, on user identity, in the gate. The role sets here answer "who is
 * in the conversation at all", not "who decides".
 *
 * <p><b>2. Administering the system is not the same as owning the records.</b>
 * {@link #DOCUMENT_DISPOSE}, {@link #DOCUMENT_DELETE} and
 * {@link #RETENTION_OVERRIDE} deliberately exclude every system-administrator
 * role from {@code approverRoles}. A system administrator can keep the platform
 * running without acquiring the authority to destroy the company's records, and
 * cannot grant themselves that authority either, because
 * {@link #USER_ROLE_GRANT} is itself gated. Conversely the records and legal
 * roles cannot restore a database or revoke a session. Neither side can
 * complete the other's destructive act alone, in either direction.
 */
public enum SensitiveAction {

    // ------------------------------------------------------------------
    // Records & documents - authority sits with records/compliance/legal.
    // No system-administrator role appears in any approver set here.
    // ------------------------------------------------------------------

    /** Permanent disposal of an archived document at end of retention. */
    DOCUMENT_DISPOSE(
            "Dispose of document",
            "COMPLIANCE",
            roles(RECORDS_OFFICER, COMPLIANCE_OFFICER, COMPLIANCE_MANAGER),
            roles(COMPLIANCE_MANAGER, DATA_PROTECTION_OFFICER, LEGAL_COUNSEL),
            1,
            "Disposal is irreversible and defeats later discovery, so the person "
                    + "who asks for it is never the person who authorises it."),

    /** Deleting a document outside the retention schedule. */
    DOCUMENT_DELETE(
            "Delete document",
            "DOCUMENTS",
            roles(RECORDS_OFFICER, COMPLIANCE_OFFICER, FACILITIES_MANAGER, DEPARTMENT_HEAD),
            roles(COMPLIANCE_MANAGER, DATA_PROTECTION_OFFICER, LEGAL_COUNSEL),
            1,
            "Deleting outside the retention schedule is the single easiest way to "
                    + "destroy evidence, so it needs a records authority to sign off."),

    /** Shortening or waiving a statutory retention window. */
    RETENTION_OVERRIDE(
            "Override retention policy",
            "COMPLIANCE",
            roles(RECORDS_OFFICER, COMPLIANCE_OFFICER),
            roles(COMPLIANCE_MANAGER, DATA_PROTECTION_OFFICER, LEGAL_COUNSEL),
            2,
            "Overriding a statutory window can put the company in breach, so it "
                    + "takes two independent records authorities."),

    /** Reclassifying a document downwards, e.g. CONFIDENTIAL to INTERNAL. */
    DOCUMENT_DECLASSIFY(
            "Lower document classification",
            "DOCUMENTS",
            roles(RECORDS_OFFICER, COMPLIANCE_OFFICER, LEGAL_OFFICER),
            roles(COMPLIANCE_MANAGER, DATA_PROTECTION_OFFICER),
            1,
            "Widening who can read a confidential document is not reversible once "
                    + "it has been read."),

    // ------------------------------------------------------------------
    // Contracts & legal - authority sits with legal, not procurement alone.
    // ------------------------------------------------------------------

    /** Early termination of a live contract. */
    CONTRACT_TERMINATE(
            "Terminate contract",
            "CONTRACTS",
            roles(CONTRACT_OFFICER, LEGAL_OFFICER),
            roles(LEGAL_COUNSEL, DEPARTMENT_HEAD),
            2,
            "Early termination usually carries a financial penalty, so legal and "
                    + "the budget owner both have to agree."),

    /** Deleting a clause from the clause library. */
    LEGAL_CLAUSE_DELETE(
            "Delete legal clause",
            "LEGAL",
            roles(LEGAL_OFFICER, CONTRACT_OFFICER),
            roles(LEGAL_COUNSEL),
            1,
            "Clauses are referenced by live contracts; removing one changes what "
                    + "those contracts mean."),

    /** Deleting a tracked contractual obligation. */
    OBLIGATION_DELETE(
            "Delete contract obligation",
            "CONTRACTS",
            roles(CONTRACT_OFFICER, LEGAL_OFFICER),
            roles(LEGAL_COUNSEL),
            1,
            "A deleted obligation stops being monitored, which is indistinguishable "
                    + "from a met obligation in every later report."),

    // ------------------------------------------------------------------
    // Identity & access - authority sits with system administration and
    // security. Records roles cannot reach these, by design.
    // ------------------------------------------------------------------

    /** Deactivating or disabling a user account. */
    USER_DEACTIVATE(
            "Deactivate user account",
            "ADMIN",
            roles(SYSTEM_ADMINISTRATOR, SUPER_ADMIN),
            roles(SUPER_ADMIN, SECURITY_OFFICER),
            1,
            "Locking someone out is an availability incident if it is wrong, and a "
                    + "convenient way to silence a reviewer if it is deliberate."),

    /** Granting a role to a user. Gated so nobody can self-grant approval rights. */
    USER_ROLE_GRANT(
            "Grant role to user",
            "ADMIN",
            roles(SYSTEM_ADMINISTRATOR, SUPER_ADMIN),
            roles(SUPER_ADMIN, SECURITY_OFFICER),
            1,
            "This is the escalation path that would otherwise defeat every other "
                    + "rule here: grant yourself an approver role, approve your own "
                    + "request. Gating it closes that loop."),

    /** Revoking a role from a user. */
    USER_ROLE_REVOKE(
            "Revoke role from user",
            "ADMIN",
            roles(SYSTEM_ADMINISTRATOR, SUPER_ADMIN),
            roles(SUPER_ADMIN, SECURITY_OFFICER),
            1,
            "Revoking the only remaining approver's role would strand every pending "
                    + "request, so a second administrator confirms it."),

    /** Forcibly revoking an active session. */
    SESSION_REVOKE(
            "Revoke active session",
            "SECURITY",
            roles(SYSTEM_ADMINISTRATOR, SUPER_ADMIN, SECURITY_OFFICER),
            roles(SUPER_ADMIN, SECURITY_OFFICER),
            1,
            "Legitimate during an incident, so this one is deliberately cheap to "
                    + "approve - but still recorded against two names."),

    /** Removing an IP address from the block list. */
    IP_UNBLOCK(
            "Unblock IP address",
            "SECURITY",
            roles(SYSTEM_ADMINISTRATOR, SUPER_ADMIN, SECURITY_OFFICER),
            roles(SUPER_ADMIN, SECURITY_OFFICER),
            1,
            "Un-blocking is how an attacker who reaches the console restores their "
                    + "own access."),

    // ------------------------------------------------------------------
    // Platform & data - the highest-blast-radius actions.
    // ------------------------------------------------------------------

    /** Restoring a database backup over live data. */
    BACKUP_RESTORE(
            "Restore database backup",
            "ADMIN",
            roles(SYSTEM_ADMINISTRATOR, SUPER_ADMIN),
            roles(SUPER_ADMIN, SECURITY_OFFICER),
            2,
            "A restore silently discards everything written since the snapshot, "
                    + "including the audit trail of whatever prompted the restore."),

    // Both AI actions accept a SECURITY_OFFICER signature as well as a SUPER_ADMIN
    // one. Originally they took SUPER_ADMIN alone, which read as the strictest
    // possible rule and behaved as the weakest: SUPER_ADMIN is also a permitted
    // requester here, a requester cannot sign their own request, and there is one
    // super administrator - so the pair of them could be requested and never
    // approved. The alternative way to reach a quorum would have been a second
    // account holding ALL permissions, which is a worse thing to own than the
    // deadlock was.
    //
    // Widening to SECURITY_OFFICER is also the more defensible rule on its own
    // terms. Both of these are security changes wearing configuration clothing, and
    // SESSION_REVOKE and IP_UNBLOCK above already pair the same two roles for the
    // same reason: the administrator who makes the change should not be the only
    // person who ever sees it.

    /** Rolling an AI instruction set back to an earlier version. */
    AI_INSTRUCTION_ROLLBACK(
            "Roll back AI instructions",
            "AI",
            roles(SYSTEM_ADMINISTRATOR, SUPER_ADMIN),
            roles(SUPER_ADMIN, SECURITY_OFFICER),
            1,
            "AI instructions decide what the assistant recommends to every user, so "
                    + "changing them changes advice company-wide - silently, with no "
                    + "build and no diff for anyone to review."),

    /** Deleting an AI provider configuration. */
    AI_PROVIDER_DELETE(
            "Delete AI provider",
            "AI",
            roles(SYSTEM_ADMINISTRATOR, SUPER_ADMIN),
            roles(SUPER_ADMIN, SECURITY_OFFICER),
            1,
            "Removing the configured provider disables classification and OCR for "
                    + "every module at once.");

    private final String label;
    private final String module;
    private final Set<String> requesterRoles;
    private final Set<String> approverRoles;
    private final int requiredApprovals;
    private final String rationale;

    SensitiveAction(String label, String module, Set<String> requesterRoles,
                    Set<String> approverRoles, int requiredApprovals, String rationale) {
        this.label = label;
        this.module = module;
        this.requesterRoles = requesterRoles;
        this.approverRoles = approverRoles;
        this.requiredApprovals = requiredApprovals;
        this.rationale = rationale;
    }

    public String getLabel() {
        return label;
    }

    public String getModule() {
        return module;
    }

    public Set<String> getRequesterRoles() {
        return requesterRoles;
    }

    public Set<String> getApproverRoles() {
        return approverRoles;
    }

    /** Number of <em>distinct</em> approvers required, never counting the requester. */
    public int getRequiredApprovals() {
        return requiredApprovals;
    }

    /** Why this action is gated. Surfaced to the approver so the prompt is not blind. */
    public String getRationale() {
        return rationale;
    }

    public boolean canRequest(Set<String> callerRoles) {
        return intersects(requesterRoles, callerRoles);
    }

    public boolean canApprove(Set<String> callerRoles) {
        return intersects(approverRoles, callerRoles);
    }

    public static Optional<SensitiveAction> from(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        return Arrays.stream(values())
                .filter(a -> a.name().equalsIgnoreCase(name.trim()))
                .findFirst();
    }

    private static boolean intersects(Set<String> policyRoles, Set<String> callerRoles) {
        if (callerRoles == null || callerRoles.isEmpty()) {
            return false;
        }
        return callerRoles.stream()
                .map(r -> r == null ? "" : r.trim().toUpperCase(java.util.Locale.ROOT))
                .map(r -> r.startsWith("ROLE_") ? r.substring("ROLE_".length()) : r)
                .anyMatch(policyRoles::contains);
    }

    private static Set<String> roles(String... names) {
        return java.util.Collections.unmodifiableSet(new LinkedHashSet<>(Arrays.asList(names)));
    }
}
