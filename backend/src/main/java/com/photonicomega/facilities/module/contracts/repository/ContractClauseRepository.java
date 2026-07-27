package com.photonicomega.facilities.module.contracts.repository;

import com.photonicomega.facilities.module.contracts.domain.ContractClause;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ContractClauseRepository extends JpaRepository<ContractClause, UUID> {
    List<ContractClause> findByContractId(UUID contractId);
}
