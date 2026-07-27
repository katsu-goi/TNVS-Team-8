package com.photonicomega.facilities.module.auth.repository;

import com.photonicomega.facilities.module.auth.domain.OtpPurpose;
import com.photonicomega.facilities.module.auth.domain.OtpToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface OtpRepository extends JpaRepository<OtpToken, UUID> {

    @Query("SELECT o FROM OtpToken o WHERE o.user.id = :userId AND o.purpose = :purpose AND o.used = false ORDER BY o.createdAt DESC")
    List<OtpToken> findActiveOtpByUserAndPurpose(UUID userId, OtpPurpose purpose);

    Optional<OtpToken> findByOtpCodeAndUser_IdAndPurposeAndUsedFalse(
            String otpCode, UUID userId, OtpPurpose purpose);

    @Modifying
    @Transactional
    @Query("UPDATE OtpToken o SET o.used = true WHERE o.user.id = :userId AND o.purpose = :purpose AND o.used = false")
    void invalidateAllActiveOtps(UUID userId, OtpPurpose purpose);

    @Modifying
    @Transactional
    @Query("DELETE FROM OtpToken o WHERE o.expiresAt < :cutoff")
    void deleteExpiredOtps(LocalDateTime cutoff);
}
