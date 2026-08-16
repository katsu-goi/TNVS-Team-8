package com.photonicomega.facilities.module.auth.service;

import com.photonicomega.facilities.module.auth.domain.HrAssistanceRequest;
import com.photonicomega.facilities.module.auth.dto.HrAssistanceRequestDto;
import com.photonicomega.facilities.module.auth.repository.HrAssistanceRequestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class HrAssistanceService {

    private final HrAssistanceRequestRepository repository;
    private final AuditService auditService;
    private final JavaMailSender mailSender;

    @Value("${app.hr.contact-email:}")
    private String hrContactEmail;

    @Value("${spring.mail.username}")
    private String fromEmail;

    @Transactional
    public HrAssistanceRequest submit(HrAssistanceRequestDto dto, String ipAddress, String userAgent) {
        HrAssistanceRequest request = HrAssistanceRequest.builder()
                .requesterName(dto.getName().trim())
                .requesterEmail(dto.getEmail().trim().toLowerCase())
                .subject(dto.getSubject().trim())
                .message(dto.getMessage().trim())
                .status("PENDING")
                .priority("NORMAL")
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .build();
        request = repository.save(request);

        auditService.log(null, "HR_ASSISTANCE_REQUESTED", "AUTH", "HrAssistanceRequest",
                request.getId().toString(),
                "HR assistance request submitted by " + request.getRequesterEmail(),
                ipAddress);

        sendHrNotification(request);
        return request;
    }

    private void sendHrNotification(HrAssistanceRequest request) {
        if (hrContactEmail == null || hrContactEmail.isBlank()) {
            log.info("HR contact email not configured; skipping notification for request {}",
                    request.getId());
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(hrContactEmail);
            message.setSubject("[HR Assistance] " + request.getSubject());
            message.setText(String.format(
                    "A new HR assistance request has been submitted.\n\n" +
                    "Name: %s\nEmail: %s\nSubject: %s\n\nMessage:\n%s\n\n" +
                    "Request ID: %s\nPlease review and respond to the requester.",
                    request.getRequesterName(), request.getRequesterEmail(),
                    request.getSubject(), request.getMessage(), request.getId()));
            mailSender.send(message);
        } catch (Exception e) {
            log.error("Failed to notify HR for request {}: {}", request.getId(), e.getMessage());
        }
    }
}
