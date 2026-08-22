package com.photonicomega.facilities.module.admin.repository;

import com.photonicomega.facilities.module.admin.domain.BackupRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface BackupRecordRepository extends JpaRepository<BackupRecord, UUID> {
    List<BackupRecord> findAllByOrderByStartedAtDesc();
    BackupRecord findFirstByOrderByStartedAtDesc();
    List<BackupRecord> findByStartedAtBetween(Instant from, Instant to);
    long countByStatus(String status);
}
