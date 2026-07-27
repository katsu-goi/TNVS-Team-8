package com.photonicomega.security.repository;

import com.photonicomega.security.entity.ActiveSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public interface ActiveSessionRepository extends JpaRepository<ActiveSession, UUID> {
    java.util.List<ActiveSession> findByUserId(UUID userId);
}
