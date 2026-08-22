package com.photonicomega.facilities.module.security.repository;

import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.domain.SecurityModule;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Repository
public interface SecurityLogRepository extends JpaRepository<SecurityLog, UUID>, JpaSpecificationExecutor<SecurityLog> {

    Page<SecurityLog> findByRiskLevel(RiskLevel riskLevel, Pageable pageable);

    Page<SecurityLog> findByModule(SecurityModule module, Pageable pageable);

    Page<SecurityLog> findByUserId(String userId, Pageable pageable);

    long countByModuleAndStatusAndTimestampAfter(SecurityModule module, String status, Instant after);

    long countByModuleAndTimestampAfter(SecurityModule module, Instant after);

    long countByModuleAndStatusAndTimestampBetween(SecurityModule module, String status, Instant from, Instant to);

    long countByTimestampBetween(Instant from, Instant to);

    long countByRiskLevelAndTimestampBetween(RiskLevel riskLevel, Instant from, Instant to);

    long countByStatusAndTimestampBetween(String status, Instant from, Instant to);

    List<SecurityLog> findByTimestampBetween(Instant from, Instant to);

    default Page<SecurityLog> filterLogs(
            String userId,
            String role,
            SecurityModule module,
            RiskLevel riskLevel,
            String ipAddress,
            Instant startDate,
            Instant endDate,
            Pageable pageable
    ) {
        return findAll((root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (userId != null) predicates.add(cb.equal(root.get("userId"), userId));
            if (role != null) predicates.add(cb.equal(root.get("role"), role));
            if (module != null) predicates.add(cb.equal(root.get("module"), module));
            if (riskLevel != null) predicates.add(cb.equal(root.get("riskLevel"), riskLevel));
            if (ipAddress != null) predicates.add(cb.equal(root.get("ipAddress"), ipAddress));
            if (startDate != null) predicates.add(cb.greaterThanOrEqualTo(root.get("timestamp"), startDate));
            if (endDate != null) predicates.add(cb.lessThanOrEqualTo(root.get("timestamp"), endDate));
            return cb.and(predicates.toArray(new Predicate[0]));
        }, pageable);
    }
}
