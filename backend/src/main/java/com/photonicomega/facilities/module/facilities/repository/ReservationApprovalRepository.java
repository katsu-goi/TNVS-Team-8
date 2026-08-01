package com.photonicomega.facilities.module.facilities.repository;

import com.photonicomega.facilities.module.facilities.domain.ReservationApproval;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ReservationApprovalRepository extends JpaRepository<ReservationApproval, UUID> {

    List<ReservationApproval> findByReservationId(UUID reservationId);
}
