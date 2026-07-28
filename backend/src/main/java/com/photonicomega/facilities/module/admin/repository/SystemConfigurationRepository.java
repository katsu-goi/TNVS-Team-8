package com.photonicomega.facilities.module.admin.repository;

import com.photonicomega.facilities.module.admin.domain.SystemConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SystemConfigurationRepository extends JpaRepository<SystemConfiguration, UUID> {
    Optional<SystemConfiguration> findByConfigKey(String configKey);
}
