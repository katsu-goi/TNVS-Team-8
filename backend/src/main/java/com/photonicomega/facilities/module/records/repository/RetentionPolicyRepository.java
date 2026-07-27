package com.photonicomega.facilities.module.records.repository;

import com.photonicomega.facilities.module.records.domain.RetentionPolicy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RetentionPolicyRepository extends JpaRepository<RetentionPolicy, UUID> {
    Optional<RetentionPolicy> findByName(String name);
    List<RetentionPolicy> findByActiveTrue();
}
