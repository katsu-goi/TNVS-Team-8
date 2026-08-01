package com.photonicomega.facilities.module.contracts.repository;

import com.photonicomega.facilities.module.contracts.domain.Contract;
import com.photonicomega.facilities.module.contracts.domain.ContractStatus;
import com.photonicomega.facilities.module.contracts.domain.ContractType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ContractRepository extends JpaRepository<Contract, UUID> {
    Optional<Contract> findByContractNumber(String contractNumber);

    List<Contract> findByStatus(ContractStatus status);

    long countByStatus(ContractStatus status);

    List<Contract> findByType(ContractType type);

    List<Contract> findByVendorId(UUID vendorId);

    long countByVendorId(UUID vendorId);

    @Query("SELECT c FROM Contract c WHERE c.endDate <= :date AND c.status = 'ACTIVE'")
    List<Contract> findExpiringContractsBefore(LocalDate date);
}
