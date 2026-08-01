package com.photonicomega.facilities.module.security.repository;

import com.photonicomega.facilities.module.security.domain.ActiveSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ActiveSessionRepository extends JpaRepository<ActiveSession, UUID> {

    Optional<ActiveSession> findBySessionIdAndStatus(String sessionId, String status);

    Optional<ActiveSession> findByUsernameAndStatus(String username, String status);

    List<ActiveSession> findByStatus(String status);

    List<ActiveSession> findByUserIdAndStatus(String userId, String status);
}
