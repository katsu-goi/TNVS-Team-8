package com.photonicomega.facilities.module.employee.service;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.service.AuditService;
import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.employee.domain.EmployeeRequest;
import com.photonicomega.facilities.module.employee.domain.NotificationType;
import com.photonicomega.facilities.module.employee.domain.RequestStatus;
import com.photonicomega.facilities.module.employee.domain.RequestType;
import com.photonicomega.facilities.module.employee.repository.EmployeeRequestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Review workflow for self-service contract/legal requests. Contract requests
 * are decided by CONTRACT_OFFICER, legal requests by LEGAL_OFFICER, and
 * SUPER_ADMIN may decide both. Each decision persists the new status and notifies
 * the requester via {@link EmployeeService#notify(User, NotificationType, String, String, String, String)}.
 * DTO mapping runs inside the service transaction so lazy associations stay safe
 * under {@code open-in-view: false}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RequestReviewService {

    private static final String MODULE = "REQUEST_REVIEW";

    private final EmployeeRequestRepository employeeRequestRepository;
    private final EmployeeService employeeService;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listForReview(User reviewer) {
        return employeeRequestRepository.findAll().stream()
                .filter(r -> !r.isDeleted())
                .filter(r -> canReview(reviewer, r))
                .sorted(Comparator.comparing(EmployeeRequest::getCreatedAt).reversed())
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listPending(User reviewer) {
        return listForReview(reviewer).stream()
                .filter(r -> {
                    Object s = r.get("status");
                    return s == RequestStatus.PENDING || s == RequestStatus.IN_REVIEW;
                })
                .collect(Collectors.toList());
    }

    @Transactional
    public Map<String, Object> approve(UUID id, User reviewer) {
        EmployeeRequest r = requireDecidable(id, reviewer);
        r.setStatus(RequestStatus.APPROVED);
        EmployeeRequest saved = employeeRequestRepository.save(r);
        auditService.log(reviewer, "APPROVE_REQUEST", MODULE, "EmployeeRequest", id.toString(),
                "Approved request: " + saved.getTitle(), null);
        notifyRequester(saved, NotificationType.APPROVAL, "Request Approved",
                "has been approved.");
        return toDto(saved);
    }

    @Transactional
    public Map<String, Object> reject(UUID id, String reason, User reviewer) {
        EmployeeRequest r = requireDecidable(id, reviewer);
        r.setStatus(RequestStatus.REJECTED);
        if (reason != null && !reason.isBlank()) {
            r.setDecisionNotes(reason);
        }
        EmployeeRequest saved = employeeRequestRepository.save(r);
        auditService.log(reviewer, "REJECT_REQUEST", MODULE, "EmployeeRequest", id.toString(),
                "Rejected request: " + saved.getTitle() + (reason != null && !reason.isBlank() ? " - " + reason : ""), null);
        String message = "has been rejected.";
        if (reason != null && !reason.isBlank()) {
            message += " Reason: " + reason;
        }
        notifyRequester(saved, NotificationType.REJECTION, "Request Rejected", message);
        return toDto(saved);
    }

    @Transactional
    public Map<String, Object> complete(UUID id, User reviewer) {
        EmployeeRequest r = findById(id);
        requireReviewer(reviewer, r);
        if (r.getStatus() != RequestStatus.APPROVED) {
            throw new BusinessRuleViolationException("Only approved requests can be completed.");
        }
        r.setStatus(RequestStatus.COMPLETED);
        EmployeeRequest saved = employeeRequestRepository.save(r);
        auditService.log(reviewer, "COMPLETE_REQUEST", MODULE, "EmployeeRequest", id.toString(),
                "Completed request: " + saved.getTitle(), null);
        notifyRequester(saved, NotificationType.COMPLETED, "Request Completed",
                "has been completed.");
        return toDto(saved);
    }

    private void notifyRequester(EmployeeRequest r, NotificationType type, String title, String suffix) {
        employeeService.notify(r.getRequester(), type, title,
                "Your " + r.getType().name().toLowerCase() + " request \"" + r.getTitle() + "\" " + suffix,
                "EmployeeRequest", r.getId().toString());
    }

    private EmployeeRequest requireDecidable(UUID id, User reviewer) {
        EmployeeRequest r = findById(id);
        requireReviewer(reviewer, r);
        if (r.getStatus() != RequestStatus.PENDING && r.getStatus() != RequestStatus.IN_REVIEW) {
            throw new BusinessRuleViolationException("Only pending or in-review requests can be decided.");
        }
        return r;
    }

    private EmployeeRequest findById(UUID id) {
        return employeeRequestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("EmployeeRequest", "id", id));
    }

    private boolean canReview(User reviewer, EmployeeRequest r) {
        if (reviewer == null || reviewer.getRoles() == null) {
            return false;
        }
        return hasRole(reviewer, "SUPER_ADMIN")
                || (r.getType() == RequestType.CONTRACT && hasRole(reviewer, "CONTRACT_OFFICER"))
                || (r.getType() == RequestType.LEGAL && hasRole(reviewer, "LEGAL_OFFICER"));
    }

    private void requireReviewer(User reviewer, EmployeeRequest r) {
        if (!canReview(reviewer, r)) {
            throw new AccessDeniedException(
                    "You are not authorized to review " + r.getType().name().toLowerCase() + " requests.");
        }
    }

    private boolean hasRole(User user, String roleName) {
        return user.getRoles().stream()
                .anyMatch(role -> hasRole(role, roleName, new HashSet<>()));
    }

    private boolean hasRole(Role role, String roleName, HashSet<String> visited) {
        if (role.getName() == null || !visited.add(role.getName())) return false;
        if (roleName.equals(role.getName())) return true;
        return role.getInheritedRoles().stream()
                .anyMatch(inherited -> hasRole(inherited, roleName, visited));
    }

    private Map<String, Object> toDto(EmployeeRequest r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("type", r.getType());
        m.put("title", r.getTitle());
        m.put("description", r.getDescription());
        m.put("status", r.getStatus());
        m.put("decisionNotes", r.getDecisionNotes());
        m.put("requesterId", r.getRequester() != null ? r.getRequester().getId() : null);
        m.put("requesterName", r.getRequester() != null ? r.getRequester().getFullName() : null);
        m.put("createdAt", r.getCreatedAt());
        m.put("updatedAt", r.getUpdatedAt());
        return m;
    }
}
