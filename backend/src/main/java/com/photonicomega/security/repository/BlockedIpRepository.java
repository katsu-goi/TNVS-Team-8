package com.photonicomega.security.repository;

import com.photonicomega.security.entity.BlockedIp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BlockedIpRepository extends JpaRepository<BlockedIp, String> {
    // Find by status if needed
    java.util.List<BlockedIp> findByStatus(String status);
}
