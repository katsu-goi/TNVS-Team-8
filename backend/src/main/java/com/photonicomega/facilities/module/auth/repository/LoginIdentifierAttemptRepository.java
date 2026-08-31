package com.photonicomega.facilities.module.auth.repository;

import com.photonicomega.facilities.module.auth.domain.LoginIdentifierAttempt;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface LoginIdentifierAttemptRepository extends JpaRepository<LoginIdentifierAttempt, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM LoginIdentifierAttempt a WHERE a.limitKey = :key AND a.windowStart = 0")
    Optional<LoginIdentifierAttempt> findLoginStateForUpdate(@Param("key") String key);

    Optional<LoginIdentifierAttempt> findByLimitKeyAndWindowStart(String key, long windowStart);
}
