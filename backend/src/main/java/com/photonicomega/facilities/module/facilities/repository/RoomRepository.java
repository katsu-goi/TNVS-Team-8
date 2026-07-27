package com.photonicomega.facilities.module.facilities.repository;

import com.photonicomega.facilities.module.facilities.domain.Room;
import com.photonicomega.facilities.module.facilities.domain.RoomType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface RoomRepository extends JpaRepository<Room, UUID> {
    List<Room> findByFacilityId(UUID facilityId);
    List<Room> findByType(RoomType type);
    List<Room> findByActiveTrue();
}
