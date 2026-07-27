package com.photonicomega.facilities.module.security.repository;

import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.domain.SecurityModule;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.UUID;

@Repository
public interface SecurityLogRepository extends JpaRepository<SecurityLog, UUID> {

    Page<SecurityLog> findByRiskLevel(RiskLevel riskLevel, Pageable pageable);

    Page<SecurityLog> findByModule(SecurityModule module, Pageable pageable);

    Page<SecurityLog> findByUserId(String userId, Pageable pageable);

    @Query("SELECT s FROM SecurityLog s WHERE " +
           "(:userId IS NULL OR s.userId = :userId) AND " +
           "(:role IS NULL OR s.role = :role) AND " +
           "(:module IS NULL OR s.module = :module) AND " +
           "(:riskLevel IS NULL OR s.riskLevel = :riskLevel) AND " +
           "(:ipAddress IS NULL OR s.ipAddress = :ipAddress) AND " +
           "(:startDate IS NULL OR s.timestamp >= :startDate) AND " +
           "(:endDate IS NULL OR s.timestamp <= :endDate)")
    Page<SecurityLog> filterLogs(
            @Param("userId") String userId,
            @Param("role") String role,
            @Param("module") SecurityModule module,
            @Param("riskLevel") RiskLevel riskLevel,
            @Param("ipAddress") String ipAddress,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate,
            Pageable pageable
    );
}
