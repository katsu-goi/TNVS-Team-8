package com.photonicomega.facilities.module.procurement.repository;

import com.photonicomega.facilities.module.procurement.domain.NoticeStatus;
import com.photonicomega.facilities.module.procurement.domain.ProcurementNotice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ProcurementNoticeRepository extends JpaRepository<ProcurementNotice, UUID> {
    List<ProcurementNotice> findByStatusInOrderByCreatedAtDesc(Collection<NoticeStatus> statuses);

    Optional<ProcurementNotice> findByDedupKey(String dedupKey);

    long countByStatus(NoticeStatus status);
}
