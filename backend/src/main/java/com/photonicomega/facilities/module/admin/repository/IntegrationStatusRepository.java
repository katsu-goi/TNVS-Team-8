package com.photonicomega.facilities.module.admin.repository;

import com.photonicomega.facilities.module.admin.domain.IntegrationStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface IntegrationStatusRepository extends JpaRepository<IntegrationStatus, UUID> {
    Optional<IntegrationStatus> findBySystemName(String systemName);
}
