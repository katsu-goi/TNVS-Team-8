package com.photonicomega.facilities.module.legal.repository;

import com.photonicomega.facilities.module.legal.domain.LegalNotice;
import com.photonicomega.facilities.module.legal.domain.NoticeStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface LegalNoticeRepository extends JpaRepository<LegalNotice, UUID> {

    List<LegalNotice> findByStatusInOrderByCreatedAtDesc(Collection<NoticeStatus> statuses);

    Optional<LegalNotice> findByDedupKey(String dedupKey);

    long countByStatus(NoticeStatus status);
}
