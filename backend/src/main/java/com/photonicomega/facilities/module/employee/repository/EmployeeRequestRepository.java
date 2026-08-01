package com.photonicomega.facilities.module.employee.repository;

import com.photonicomega.facilities.module.employee.domain.EmployeeRequest;
import com.photonicomega.facilities.module.employee.domain.RequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EmployeeRequestRepository extends JpaRepository<EmployeeRequest, UUID> {

    List<EmployeeRequest> findByRequesterIdAndDeletedFalseOrderByCreatedAtDesc(UUID requesterId);

    Optional<EmployeeRequest> findByIdAndRequesterId(UUID id, UUID requesterId);

    long countByRequesterIdAndStatus(UUID requesterId, RequestStatus status);
}
