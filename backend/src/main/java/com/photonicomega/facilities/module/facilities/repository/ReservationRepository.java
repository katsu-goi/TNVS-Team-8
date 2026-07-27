package com.photonicomega.facilities.module.facilities.repository;

import com.photonicomega.facilities.module.facilities.domain.Reservation;
import com.photonicomega.facilities.module.facilities.domain.ReservationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface ReservationRepository extends JpaRepository<Reservation, UUID> {

    List<Reservation> findByRoomId(UUID roomId);

    List<Reservation> findByReservedById(UUID userId);

    @Query("""
        SELECT r FROM Reservation r
        WHERE r.room.id = :roomId
        AND r.status NOT IN ('CANCELLED', 'REJECTED')
        AND ((r.startTime < :endTime AND r.endTime > :startTime))
    """)
    List<Reservation> findConflictingReservations(
            @Param("roomId") UUID roomId,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime
    );

    List<Reservation> findByStatus(ReservationStatus status);
}
