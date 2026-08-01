package com.photonicomega.facilities.module.compliance.repository;

import com.photonicomega.facilities.module.compliance.domain.AlertStatus;
import com.photonicomega.facilities.module.compliance.domain.ComplianceAlert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ComplianceAlertRepository extends JpaRepository<ComplianceAlert, UUID> {

    List<ComplianceAlert> findByStatusInOrderByCreatedAtDesc(Collection<AlertStatus> statuses);

    Optional<ComplianceAlert> findByDedupKey(String dedupKey);

    long countByStatus(AlertStatus status);
}
