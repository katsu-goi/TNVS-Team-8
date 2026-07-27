package com.photonicomega.security.repository;

import com.photonicomega.security.entity.SecurityAlert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

@Repository
public interface SecurityAlertRepository extends JpaRepository<SecurityAlert, Long>, JpaSpecificationExecutor<SecurityAlert> {
    java.util.List<SecurityAlert> findBySeverity(String severity);
    java.util.List<SecurityAlert> findByStatus(String status);
}
