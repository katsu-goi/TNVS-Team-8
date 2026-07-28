package com.photonicomega.facilities.module.facilities.repository;

import com.photonicomega.facilities.module.facilities.domain.Equipment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface EquipmentRepository extends JpaRepository<Equipment, UUID> {
    List<Equipment> findByRoomId(UUID roomId);
    boolean existsBySerialNumber(String serialNumber);
    long count();
    long countByStatus(com.photonicomega.facilities.module.facilities.domain.EquipmentStatus status);
    List<Equipment> findByCategory(String category);
}
