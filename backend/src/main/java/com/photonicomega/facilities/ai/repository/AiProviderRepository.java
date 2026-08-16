package com.photonicomega.facilities.ai.repository;

import com.photonicomega.facilities.ai.domain.AiProvider;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AiProviderRepository extends JpaRepository<AiProvider, String> {
    List<AiProvider> findAllByDeletedFalse();
    Optional<AiProvider> findByIdAndDeletedFalse(String id);
    List<AiProvider> findAllByDeletedFalseAndIsDefaultTrue();
}