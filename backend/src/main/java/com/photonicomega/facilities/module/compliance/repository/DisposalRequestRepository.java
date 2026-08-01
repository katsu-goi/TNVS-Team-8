package com.photonicomega.facilities.module.compliance.repository;

import com.photonicomega.facilities.module.compliance.domain.DisposalRequest;
import com.photonicomega.facilities.module.compliance.domain.DisposalStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DisposalRequestRepository extends JpaRepository<DisposalRequest, UUID> {

    List<DisposalRequest> findByStatusOrderByCreatedAtDesc(DisposalStatus status);

    List<DisposalRequest> findAllByOrderByCreatedAtDesc();

    long countByStatus(DisposalStatus status);

    List<DisposalRequest> findByDocumentIdAndStatus(UUID documentId, DisposalStatus status);
}
