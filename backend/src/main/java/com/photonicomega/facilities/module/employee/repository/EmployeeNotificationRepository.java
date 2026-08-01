package com.photonicomega.facilities.module.employee.repository;

import com.photonicomega.facilities.module.employee.domain.EmployeeNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EmployeeNotificationRepository extends JpaRepository<EmployeeNotification, UUID> {

    List<EmployeeNotification> findByRecipientIdAndDeletedFalseOrderByCreatedAtDesc(UUID recipientId);

    long countByRecipientIdAndReadFalseAndDeletedFalse(UUID recipientId);

    Optional<EmployeeNotification> findByIdAndRecipientId(UUID id, UUID recipientId);
}
