package com.photonicomega.facilities.module.security.repository;

import com.photonicomega.facilities.module.security.domain.BlockedIp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface BlockedIpRepository extends JpaRepository<BlockedIp, UUID> {

    Optional<BlockedIp> findByIpAddressAndStatus(String ipAddress, String status);

    boolean existsByIpAddressAndStatus(String ipAddress, String status);

    List<BlockedIp> findByStatus(String status);
}
