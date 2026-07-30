package com.photonicomega.facilities.module.visitor.repository;

import com.photonicomega.facilities.module.visitor.domain.Visitor;
import com.photonicomega.facilities.module.visitor.domain.VisitorStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface VisitorRepository extends JpaRepository<Visitor, UUID> {
    Optional<Visitor> findByQrCodeToken(String qrCodeToken);
    List<Visitor> findByHostId(UUID hostId);
    List<Visitor> findByStatus(VisitorStatus status);
    long countByStatus(VisitorStatus status);
}
