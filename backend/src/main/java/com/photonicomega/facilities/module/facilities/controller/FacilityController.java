package com.photonicomega.facilities.module.facilities.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.facilities.domain.*;
import com.photonicomega.facilities.module.facilities.repository.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

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
    @PreAuthorize("hasAnyRole('FACILITIES_MANAGER','FACILITIES_OFFICER')")
    @Operation(summary = "Get all facilities")
    public ResponseEntity<ApiResponse<List<FacilityDto>>> getAllFacilities() {
        List<FacilityDto> facilities = facilityRepository.findAll().stream()
                .map(this::toDto)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(facilities, "Facilities fetched successfully"));
    }

    @PostMapping
    @PreAuthorize("hasRole('FACILITIES_MANAGER')")
    @Operation(summary = "Create a new facility")
    public ResponseEntity<ApiResponse<FacilityDto>> createFacility(@RequestBody Facility facility) {
        Facility saved = facilityRepository.save(facility);
        return ResponseEntity.ok(ApiResponse.success(toDto(saved), "Facility created successfully"));
    }

    private FacilityDto toDto(Facility f) {
        return FacilityDto.builder()
                .id(f.getId())
                .name(f.getName())
                .code(f.getCode())
                .type(f.getType() != null ? f.getType().name() : null)
                .address(f.getAddress())
                .city(f.getCity())
                .country(f.getCountry())
                .timezone(f.getTimezone())
                .totalCapacity(f.getTotalCapacity())
                .active(f.getActive())
                .roomCount(roomRepository.countByFacilityId(f.getId()))
                .build();
    }

    @Data
    @Builder
    public static class FacilityDto {
        private UUID id;
        private String name;
        private String code;
        private String type;
        private String address;
        private String city;
        private String country;
        private String timezone;
        private Integer totalCapacity;
        private Boolean active;
        private long roomCount;
    }

    @GetMapping("/{facilityId}/rooms")
    @PreAuthorize("hasAnyRole('FACILITIES_MANAGER','FACILITIES_OFFICER')")
    @Operation(summary = "Get rooms by facility ID")
    public ResponseEntity<ApiResponse<List<Room>>> getRoomsByFacility(@PathVariable UUID facilityId) {
        return ResponseEntity.ok(ApiResponse.success(roomRepository.findByFacilityId(facilityId), "Rooms fetched successfully"));
    }

    @PostMapping("/rooms")
    @PreAuthorize("hasRole('FACILITIES_MANAGER')")
    @Operation(summary = "Create a new room")
    public ResponseEntity<ApiResponse<Room>> createRoom(@RequestBody Room room) {
        return ResponseEntity.ok(ApiResponse.success(roomRepository.save(room), "Room created successfully"));
    }

    @GetMapping("/reservations")
    @PreAuthorize("hasAnyRole('FACILITIES_MANAGER','FACILITIES_OFFICER')")
    @Operation(summary = "Get all room reservations")
    public ResponseEntity<ApiResponse<List<Reservation>>> getAllReservations() {
        return ResponseEntity.ok(ApiResponse.success(reservationRepository.findAll(), "Reservations fetched successfully"));
    }

    @PostMapping("/reservations")
    @PreAuthorize("hasAnyRole('FACILITIES_MANAGER','FACILITIES_OFFICER')")
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
