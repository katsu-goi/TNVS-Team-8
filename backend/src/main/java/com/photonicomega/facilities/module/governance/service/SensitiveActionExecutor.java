package com.photonicomega.facilities.module.governance.service;

import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;

/**
 * Carries out one authorised {@link SensitiveAction}.
 *
 * <p>Each module supplies its own implementation, which keeps the gate from
 * having to know how to delete a document, terminate a contract, or restore a
 * backup. The gate only knows whether it is allowed to.
 *
 * <p>Implementations must assume they are the <em>only</em> place the mutation
 * happens, and must not perform their own authorization: by the time
 * {@link #execute} is called the four-eyes check has already passed, and a
 * second check here would either be redundant or, worse, disagree with the
 * gate and leave a request permanently stuck in APPROVED.
 */
public interface SensitiveActionExecutor {

    /** Which action this executor carries out. One executor per action. */
    SensitiveAction supports();

    /**
     * Perform the authorised act.
     *
     * @return a short human-readable outcome recorded on the request, e.g.
     *         "Document 'Q3 Lease' disposed of; 1 grant revoked."
     * @throws RuntimeException if the act cannot be completed - the gate records
     *         the message against the request and marks it FAILED rather than
     *         silently leaving it APPROVED.
     */
    String execute(ApprovalRequest request);
}
