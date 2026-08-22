package com.photonicomega.facilities.module.governance.repository;

import com.photonicomega.facilities.module.governance.domain.ApprovalRequest;
import com.photonicomega.facilities.module.governance.domain.ApprovalStatus;
import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ApprovalRequestRepository extends JpaRepository<ApprovalRequest, UUID> {

    List<ApprovalRequest> findByStatusOrderByRequestedAtDesc(ApprovalStatus status);

    List<ApprovalRequest> findByRequestedByIdOrderByRequestedAtDesc(UUID requestedById);

    List<ApprovalRequest> findByTargetTypeAndTargetIdOrderByRequestedAtDesc(String targetType, String targetId);

    /**
     * Guards against duplicate intent: a second request for the same act on the
     * same target while one is already waiting would let a requester manufacture
     * two half-approved requests and pick whichever gets a signature first.
     */
    Optional<ApprovalRequest> findFirstByActionAndTargetIdAndStatus(
            SensitiveAction action, String targetId, ApprovalStatus status);

    /** Queue for an approver: pending, not expired, most urgent first. */
    @Query("""
        SELECT r FROM ApprovalRequest r
        WHERE r.status = com.photonicomega.facilities.module.governance.domain.ApprovalStatus.PENDING
          AND r.expiresAt > :now
        ORDER BY r.expiresAt ASC
    """)
    List<ApprovalRequest> findOpenQueue(@Param("now") LocalDateTime now);

    /** Swept by the scheduler so a forgotten request lapses instead of lingering. */
    @Query("""
        SELECT r FROM ApprovalRequest r
        WHERE r.status = com.photonicomega.facilities.module.governance.domain.ApprovalStatus.PENDING
          AND r.expiresAt <= :now
    """)
    List<ApprovalRequest> findLapsed(@Param("now") LocalDateTime now);

    long countByStatus(ApprovalStatus status);
}
