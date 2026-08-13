package com.photonicomega.facilities.module.auth.repository;

import com.photonicomega.facilities.module.auth.domain.HrAssistanceRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface HrAssistanceRequestRepository extends JpaRepository<HrAssistanceRequest, UUID>,
        JpaSpecificationExecutor<HrAssistanceRequest> {

    List<HrAssistanceRequest> findByStatusOrderByCreatedAtDesc(String status);

    List<HrAssistanceRequest> findAllByOrderByCreatedAtDesc();
}
