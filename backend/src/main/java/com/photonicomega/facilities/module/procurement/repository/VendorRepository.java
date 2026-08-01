package com.photonicomega.facilities.module.procurement.repository;

import com.photonicomega.facilities.module.procurement.domain.Vendor;
import com.photonicomega.facilities.module.procurement.domain.VendorStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface VendorRepository extends JpaRepository<Vendor, UUID> {
    List<Vendor> findByStatus(VendorStatus status);

    long countByStatus(VendorStatus status);

    Optional<Vendor> findByVendorCode(String vendorCode);
}
