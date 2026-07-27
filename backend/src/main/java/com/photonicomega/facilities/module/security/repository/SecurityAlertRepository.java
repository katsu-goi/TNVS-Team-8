package com.photonicomega.facilities.module.security.repository;

import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityAlert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface SecurityAlertRepository extends JpaRepository<SecurityAlert, UUID> {

    List<SecurityAlert> findByStatus(String status);

    List<SecurityAlert> findBySeverityAndStatus(RiskLevel severity, String status);
}
