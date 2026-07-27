package com.photonicomega.security.repository;

import com.photonicomega.security.entity.SecurityLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public interface SecurityLogRepository extends JpaRepository<SecurityLog, Long> {
    // Custom query methods can be added as needed
    java.util.List<SecurityLog> findByUserId(UUID userId);
}
