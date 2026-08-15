package com.photonicomega.facilities.ai.repository;

import com.photonicomega.facilities.ai.domain.AiModuleConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AiModuleConfigRepository extends JpaRepository<AiModuleConfig, UUID> {
    Optional<AiModuleConfig> findByModuleKeyAndDeletedFalse(String moduleKey);
    List<AiModuleConfig> findAllByDeletedFalse();
    Optional<AiModuleConfig> findByModuleKey(String moduleKey);
}