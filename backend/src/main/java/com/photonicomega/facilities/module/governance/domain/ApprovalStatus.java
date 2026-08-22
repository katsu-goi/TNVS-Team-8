package com.photonicomega.facilities.module.governance.domain;

/** Lifecycle of an {@link ApprovalRequest}. */
public enum ApprovalStatus {

    /** Awaiting the required number of distinct approvals. Nothing has changed yet. */
    PENDING,

    /** Quorum reached. The act is authorised but has not run yet. */
    APPROVED,

    /** Any single approver rejected. Terminal - the act will never run. */
    REJECTED,

    /** The requester withdrew it before a decision. Terminal. */
    CANCELLED,

    /** The approval window elapsed without quorum. Terminal, and must be re-requested. */
    EXPIRED,

    /** The authorised act has been carried out. Terminal. */
    EXECUTED,

    /** Quorum was reached but the act failed when it ran. Terminal; needs a new request. */
    FAILED
}
