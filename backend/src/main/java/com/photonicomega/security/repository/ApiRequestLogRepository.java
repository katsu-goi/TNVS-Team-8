package com.photonicomega.security.repository;

import com.photonicomega.security.entity.ApiRequestLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public interface ApiRequestLogRepository extends JpaRepository<ApiRequestLog, Long> {
    java.util.List<ApiRequestLog> findByUserId(UUID userId);
    java.util.List<ApiRequestLog> findByEndpoint(String endpoint);
}
