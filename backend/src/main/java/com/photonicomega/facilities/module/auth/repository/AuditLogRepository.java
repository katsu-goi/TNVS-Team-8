package com.photonicomega.facilities.module.auth.repository;

import com.photonicomega.facilities.module.auth.domain.AuditLog;
import com.photonicomega.facilities.module.auth.domain.AuditSeverity;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, UUID>,
        JpaSpecificationExecutor<AuditLog> {

    Page<AuditLog> findByUserId(UUID userId, Pageable pageable);

    Page<AuditLog> findByModule(String module, Pageable pageable);

    Page<AuditLog> findByEntityTypeAndEntityId(String entityType, String entityId, Pageable pageable);

    List<AuditLog> findByCreatedAtAfterOrderByCreatedAtDesc(LocalDateTime after);

    List<AuditLog> findByModuleAndCreatedAtAfterOrderByCreatedAtDesc(String module, LocalDateTime after);

    long countByCreatedAtBetween(LocalDateTime from, LocalDateTime to);

    List<AuditLog> findByCreatedAtBetween(LocalDateTime from, LocalDateTime to);

    long countByModuleAndCreatedAtAfter(String module, LocalDateTime after);

    long countByActionContainingAndCreatedAtAfter(String actionToken, LocalDateTime after);

    default Page<AuditLog> filterAuditLogs(
            UUID userId,
            String action,
            String module,
            AuditSeverity severity,
            LocalDateTime startDate,
            LocalDateTime endDate,
            Pageable pageable
    ) {
        return findAll((root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (userId != null) predicates.add(cb.equal(root.get("userId"), userId));
            if (action != null) predicates.add(cb.equal(root.get("action"), action));
            if (module != null) predicates.add(cb.equal(root.get("module"), module));
            if (severity != null) predicates.add(cb.equal(root.get("severity"), severity));
            if (startDate != null) predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), startDate));
            if (endDate != null) predicates.add(cb.lessThanOrEqualTo(root.get("createdAt"), endDate));
            return cb.and(predicates.toArray(new Predicate[0]));
        }, pageable);
    }
}
