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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    // Room.facility and Room.amenities are LAZY and open-in-view is disabled,
    // so the data is flattened to DTO maps inside a session.
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getRoomsByFacility(@PathVariable UUID facilityId) {
        List<Map<String, Object>> rooms = roomRepository.findByFacilityId(facilityId).stream()
                .map(r -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", r.getId());
                    m.put("roomNumber", r.getRoomNumber());
                    m.put("name", r.getName());
                    m.put("type", r.getType() != null ? r.getType().name() : null);
                    m.put("floorNumber", r.getFloorNumber());
                    m.put("building", r.getBuilding());
                    m.put("capacity", r.getCapacity());
                    m.put("openTime", r.getOpenTime());
                    m.put("closeTime", r.getCloseTime());
                    m.put("status", r.getStatus() != null ? r.getStatus().name() : null);
                    m.put("hasProjector", r.getHasProjector());
                    m.put("hasVideoConference", r.getHasVideoConference());
                    m.put("hasWhiteboard", r.getHasWhiteboard());
                    m.put("active", r.getActive());
                    m.put("facilityId", r.getFacility() != null ? r.getFacility().getId() : null);
                    m.put("facilityName", r.getFacility() != null ? r.getFacility().getName() : null);
                    return m;
                }).toList();
        return ResponseEntity.ok(ApiResponse.success(rooms, "Rooms fetched successfully"));
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
    // Reservation.room and Reservation.reservedBy are LAZY and open-in-view is
    // disabled, so the data is flattened to DTO maps inside a session.
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAllReservations() {
        List<Map<String, Object>> reservations = reservationRepository.findAll().stream()
                .map(r -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", r.getId());
                    m.put("title", r.getTitle());
                    m.put("description", r.getDescription());
                    m.put("startTime", r.getStartTime());
                    m.put("endTime", r.getEndTime());
                    m.put("status", r.getStatus() != null ? r.getStatus().name() : null);
                    m.put("expectedAttendees", r.getExpectedAttendees());
                    m.put("rejectionReason", r.getRejectionReason());
                    m.put("roomId", r.getRoom() != null ? r.getRoom().getId() : null);
                    m.put("roomName", r.getRoom() != null ? r.getRoom().getName() : null);
                    m.put("roomNumber", r.getRoom() != null ? r.getRoom().getRoomNumber() : null);
                    m.put("reservedById", r.getReservedBy() != null ? r.getReservedBy().getId() : null);
                    m.put("reservedByName", r.getReservedBy() != null ? r.getReservedBy().getFullName() : null);
                    m.put("createdAt", r.getCreatedAt());
                    return m;
                }).toList();
        return ResponseEntity.ok(ApiResponse.success(reservations, "Reservations fetched successfully"));
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
