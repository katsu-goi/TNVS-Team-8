package com.photonicomega.facilities.module.facilities.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.facilities.domain.*;
import com.photonicomega.facilities.module.facilities.repository.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/facilities")
@RequiredArgsConstructor
@Tag(name = "Facilities & Reservations", description = "Endpoints for managing facilities, rooms, equipment, and room bookings")
public class FacilityController {

    private final FacilityRepository facilityRepository;
    private final RoomRepository roomRepository;
    private final ReservationRepository reservationRepository;

    @GetMapping
    @Operation(summary = "Get all facilities")
    public ResponseEntity<ApiResponse<List<Facility>>> getAllFacilities() {
        return ResponseEntity.ok(ApiResponse.success(facilityRepository.findAll(), "Facilities fetched successfully"));
    }

    @PostMapping
    @Operation(summary = "Create a new facility")
    public ResponseEntity<ApiResponse<Facility>> createFacility(@RequestBody Facility facility) {
        return ResponseEntity.ok(ApiResponse.success(facilityRepository.save(facility), "Facility created successfully"));
    }

    @GetMapping("/{facilityId}/rooms")
    @Operation(summary = "Get rooms by facility ID")
    public ResponseEntity<ApiResponse<List<Room>>> getRoomsByFacility(@PathVariable UUID facilityId) {
        return ResponseEntity.ok(ApiResponse.success(roomRepository.findByFacilityId(facilityId), "Rooms fetched successfully"));
    }

    @PostMapping("/rooms")
    @Operation(summary = "Create a new room")
    public ResponseEntity<ApiResponse<Room>> createRoom(@RequestBody Room room) {
        return ResponseEntity.ok(ApiResponse.success(roomRepository.save(room), "Room created successfully"));
    }

    @GetMapping("/reservations")
    @Operation(summary = "Get all room reservations")
    public ResponseEntity<ApiResponse<List<Reservation>>> getAllReservations() {
        return ResponseEntity.ok(ApiResponse.success(reservationRepository.findAll(), "Reservations fetched successfully"));
    }

    @PostMapping("/reservations")
    @Operation(summary = "Book a room / Create reservation with conflict check")
    public ResponseEntity<ApiResponse<Reservation>> createReservation(@RequestBody Reservation reservation) {
        List<Reservation> conflicts = reservationRepository.findConflictingReservations(
                reservation.getRoom().getId(),
                reservation.getStartTime(),
                reservation.getEndTime()
        );
        if (!conflicts.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiResponse.failure("Room is already reserved for the selected timeframe.", "CONFLICT"));
        }
        reservation.setStatus(ReservationStatus.APPROVED);
        return ResponseEntity.ok(ApiResponse.success(reservationRepository.save(reservation), "Reservation confirmed successfully"));
    }
}
