package com.photonicomega.facilities.module.legal.repository;

import com.photonicomega.facilities.module.legal.domain.CasePriority;
import com.photonicomega.facilities.module.legal.domain.CaseStatus;
import com.photonicomega.facilities.module.legal.domain.LegalCase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface LegalCaseRepository extends JpaRepository<LegalCase, UUID> {
    Optional<LegalCase> findByCaseNumber(String caseNumber);
    List<LegalCase> findByStatus(CaseStatus status);
    List<LegalCase> findByPriority(CasePriority priority);
    List<LegalCase> findByLeadLawyerId(UUID leadLawyerId);
}
