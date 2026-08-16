package com.photonicomega.facilities.module.employee.domain;

public enum NotificationType {
    APPROVAL,
    REJECTION,
    COMPLETED,
    CANCELLED,
    REMINDER,
    INFO,
    /** A registered visitor has checked in and their host is being told. */
    VISITOR_ARRIVAL
}
