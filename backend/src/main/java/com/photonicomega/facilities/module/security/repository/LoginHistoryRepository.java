package com.photonicomega.facilities.module.security.repository;

import com.photonicomega.facilities.module.security.domain.LoginHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface LoginHistoryRepository extends JpaRepository<LoginHistory, UUID> {

    List<LoginHistory> findByUsername(String username);

    long countByUsernameAndStatus(String username, String status);

    long countByIpAddressAndStatus(String ipAddress, String status);
}
