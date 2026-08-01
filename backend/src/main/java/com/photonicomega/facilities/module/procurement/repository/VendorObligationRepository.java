package com.photonicomega.facilities.module.procurement.repository;

import com.photonicomega.facilities.module.procurement.domain.ObligationStatus;
import com.photonicomega.facilities.module.procurement.domain.VendorObligation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface VendorObligationRepository extends JpaRepository<VendorObligation, UUID> {
    List<VendorObligation> findByVendorId(UUID vendorId);

    List<VendorObligation> findByStatus(ObligationStatus status);
}
