package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.module.auth.domain.*;
import com.photonicomega.facilities.module.auth.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(User user, String action, String module, String entityType,
                    String entityId, String description, String ipAddress) {
        try {
            AuditLog auditLog = AuditLog.builder()
                    .userId(user != null ? user.getId() : null)
                    .userEmail(user != null ? user.getEmail() : null)
                    .userFullName(user != null ? user.getFullName() : null)
                    .action(action)
                    .module(module)
                    .entityType(entityType)
                    .entityId(entityId)
                    .description(description)
                    .ipAddress(ipAddress)
                    .severity(AuditSeverity.INFO)
                    .status("SUCCESS")
                    .build();
            auditLogRepository.save(auditLog);
        } catch (Exception e) {
            log.error("Failed to persist audit log: {}", e.getMessage());
        }
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logWithValues(User user, String action, String module, String entityType,
                               String entityId, String description, String oldValues,
                               String newValues, String ipAddress) {
        try {
            AuditLog auditLog = AuditLog.builder()
                    .userId(user != null ? user.getId() : null)
                    .userEmail(user != null ? user.getEmail() : null)
                    .userFullName(user != null ? user.getFullName() : null)
                    .action(action)
                    .module(module)
                    .entityType(entityType)
                    .entityId(entityId)
                    .description(description)
                    .oldValues(oldValues)
                    .newValues(newValues)
                    .ipAddress(ipAddress)
                    .severity(AuditSeverity.INFO)
                    .status("SUCCESS")
                    .build();
            auditLogRepository.save(auditLog);
        } catch (Exception e) {
            log.error("Failed to persist audit log: {}", e.getMessage());
        }
    }
}
