package com.photonicomega.facilities.module.facilities.repository;

import com.photonicomega.facilities.module.facilities.domain.RoomAmenity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface RoomAmenityRepository extends JpaRepository<RoomAmenity, UUID> {

    List<RoomAmenity> findByRoomId(UUID roomId);
}
