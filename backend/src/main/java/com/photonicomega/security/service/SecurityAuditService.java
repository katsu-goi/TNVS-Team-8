package com.photonicomega.security.service;

import com.photonicomega.security.dto.AuditEvent;
import com.photonicomega.security.entity.SecurityLog;
import com.photonicomega.security.repository.SecurityLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import java.time.OffsetDateTime;

@Service
public class SecurityAuditService {

    private final SecurityLogRepository securityLogRepository;

    @Autowired
    public SecurityAuditService(SecurityLogRepository securityLogRepository) {
        this.securityLogRepository = securityLogRepository;
    }

    @Async
    public void logEvent(AuditEvent event) {
        SecurityLog log = new SecurityLog();
        log.setUserId(event.getUserId());
        log.setFullName(event.getFullName());
        log.setRole(event.getRole());
        log.setModule(event.getModule());
        log.setAction(event.getAction());
        log.setTimestamp(event.getTimestamp() != null ? event.getTimestamp() : OffsetDateTime.now());
        log.setIpAddress(event.getIpAddress());
        log.setBrowser(event.getBrowser());
        log.setOs(event.getOs());
        log.setDevice(event.getDevice());
        log.setSessionId(event.getSessionId());
        log.setApiEndpoint(event.getApiEndpoint());
        log.setHttpMethod(event.getHttpMethod());
        log.setAffectedRecord(event.getAffectedRecord());
        log.setPreviousValue(event.getPreviousValue());
        log.setNewValue(event.getNewValue());
        log.setRiskLevel(event.getRiskLevel());
        log.setStatus(event.getStatus());
        securityLogRepository.save(log);
    }
}
