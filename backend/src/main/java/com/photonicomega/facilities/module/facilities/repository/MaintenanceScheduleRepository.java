package com.photonicomega.facilities.module.facilities.repository;

import com.photonicomega.facilities.module.facilities.domain.MaintenanceSchedule;
import com.photonicomega.facilities.module.facilities.domain.MaintenanceStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface MaintenanceScheduleRepository extends JpaRepository<MaintenanceSchedule, UUID> {

    List<MaintenanceSchedule> findByRoomId(UUID roomId);

    List<MaintenanceSchedule> findByStatus(MaintenanceStatus status);

    List<MaintenanceSchedule> findByStartTimeBetween(LocalDateTime start, LocalDateTime end);

    @Query("""
        SELECT m FROM MaintenanceSchedule m
        WHERE m.room.id = :roomId
        AND m.status IN ('SCHEDULED', 'IN_PROGRESS')
        AND (m.startTime < :endTime AND m.endTime > :startTime)
    """)
    List<MaintenanceSchedule> findOverlappingMaintenance(
            @Param("roomId") UUID roomId,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime
    );
}
