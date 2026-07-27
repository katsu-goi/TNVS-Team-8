package com.photonicomega.facilities.module.security.repository;

import com.photonicomega.facilities.module.security.domain.ApiRequestLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ApiRequestLogRepository extends JpaRepository<ApiRequestLog, UUID> {

    List<ApiRequestLog> findByIpAddress(String ipAddress);
}
