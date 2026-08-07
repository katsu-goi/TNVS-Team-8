package com.photonicomega.facilities.module.visitor.repository;

import com.photonicomega.facilities.module.visitor.domain.VisitorVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface VisitorVerificationRepository extends JpaRepository<VisitorVerification, UUID> {

    /** Verification history for one visitor, newest attempt first. */
    List<VisitorVerification> findByVisitorIdAndDeletedFalseOrderByCreatedAtDesc(UUID visitorId);

    /** All verification attempts, newest first. */
    List<VisitorVerification> findByDeletedFalseOrderByCreatedAtDesc();
}
