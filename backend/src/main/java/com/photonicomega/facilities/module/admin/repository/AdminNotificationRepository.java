package com.photonicomega.facilities.module.admin.repository;

import com.photonicomega.facilities.module.admin.domain.AdminNotification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AdminNotificationRepository extends JpaRepository<AdminNotification, UUID> {
    List<AdminNotification> findAllByOrderByCreatedAtDesc();
    long countByReadFalse();
}
