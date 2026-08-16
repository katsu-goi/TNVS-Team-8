package com.photonicomega.facilities.module.admin.repository;

import com.photonicomega.facilities.module.admin.domain.AdminNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface AdminNotificationRepository extends JpaRepository<AdminNotification, UUID> {

    List<AdminNotification> findAllByOrderByCreatedAtDesc();

    long countByReadFalse();

    /** Notifications addressed to the given admin, plus any legacy global ones. */
    @Query("SELECT n FROM AdminNotification n WHERE (n.recipient IS NULL OR n.recipient.id = :recipientId) ORDER BY n.createdAt DESC")
    List<AdminNotification> findVisible(@Param("recipientId") UUID recipientId);

    /** Unread count for the given admin, including any legacy global ones. */
    @Query("SELECT COUNT(n) FROM AdminNotification n WHERE n.read = false AND (n.recipient IS NULL OR n.recipient.id = :recipientId)")
    long countUnread(@Param("recipientId") UUID recipientId);
}