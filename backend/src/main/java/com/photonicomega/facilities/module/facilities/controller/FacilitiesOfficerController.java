package com.photonicomega.facilities.module.facilities.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.facilities.ai.ReservationAiService;
import com.photonicomega.facilities.module.facilities.domain.*;
import com.photonicomega.facilities.module.facilities.repository.*;
import com.photonicomega.facilities.module.facilities.service.RoomAvailabilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/v1/facilities-officer")
@RequiredArgsConstructor
@Tag(name = "Facilities Officer", description = "Facility reservation request and room search endpoints")
public class FacilitiesOfficerController {

    private final RoomAvailabilityService roomAvailabilityService;
    private final ReservationRepository reservationRepository;
    private final RoomRepository roomRepository;
    private final MaintenanceScheduleRepository maintenanceScheduleRepository;
    private final EquipmentRepository equipmentRepository;
    private final UserRepository userRepository;
    private final ReservationAiService reservationAiService;

    @PostMapping("/rooms/available")
    @Operation(summary = "Search rooms with availability for a requested date/time range")
    public ResponseEntity<ApiResponse<Map<String, Object>>> searchRooms(
            @RequestBody Map<String, Object> request) {

        LocalDate date = LocalDate.parse((String) request.get("date"));
        LocalTime start = LocalTime.parse((String) request.get("startTime"));
        LocalTime end = LocalTime.parse((String) request.get("endTime"));

        Map<String, Object> result = roomAvailabilityService.findAvailableRooms(
                date,
                start,
                end,
                (String) request.get("facilityId"),
                (String) request.get("facilityType"),
                (String) request.get("building"),
                request.get("floor") != null ? Integer.parseInt(String.valueOf(request.get("floor"))) : null,
                request.get("minCapacity") != null ? Integer.parseInt(String.valueOf(request.get("minCapacity"))) : null,
                request.get("roomType") != null ? RoomType.valueOf((String) request.get("roomType")) : null,
                (String) request.get("availability"));

        return ResponseEntity.ok(ApiResponse.success(result, "Rooms fetched successfully"));
    }

    @GetMapping("/rooms/filters")
    @Operation(summary = "Room search filter options")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getFilterOptions() {
        return ResponseEntity.ok(ApiResponse.success(roomAvailabilityService.getFilterOptions(), "Filters fetched successfully"));
    }

    @GetMapping("/dashboard/summary")
    @Operation(summary = "Facilities officer dashboard KPIs, charts and tables")
    // Touches Reservation.room / .reservedBy, Room.facility, MaintenanceSchedule.room
    // and Equipment.room, all LAZY, with open-in-view disabled - same reason
    // the manager /calendar endpoint needs a read-only transaction.
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDashboardSummary() {
        LocalDate today = LocalDate.now();
        LocalDateTime todayStart = today.atStartOfDay();
        LocalDateTime todayEnd = today.atTime(LocalTime.MAX);

        List<Reservation> todayReservations = reservationRepository.findByStartTimeBetween(todayStart, todayEnd);

        Map<String, Object> kpi = new LinkedHashMap<>();
        kpi.put("todaysReservations", todayReservations.size());
        kpi.put("pendingRequests", reservationRepository.countByStatus(ReservationStatus.PENDING));
        kpi.put("facilitiesUnderMaintenance", roomRepository.findAll().stream()
                .filter(r -> r.getStatus() == RoomStatus.MAINTENANCE || r.getStatus() == RoomStatus.OUT_OF_SERVICE)
                .count());
        kpi.put("tasksDueToday", maintenanceScheduleRepository.findByStartTimeBetween(todayStart, todayEnd).stream()
                .filter(m -> m.getStatus() == MaintenanceStatus.SCHEDULED || m.getStatus() == MaintenanceStatus.IN_PROGRESS)
                .count());

        List<Map<String, Object>> dailyReservationLoad = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            LocalDate day = today.minusDays(i);
            long count = reservationRepository.countByDateRange(day.atStartOfDay(), day.atTime(LocalTime.MAX));
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("day", day.getDayOfWeek().name());
            m.put("count", count);
            dailyReservationLoad.add(m);
        }

        Map<RoomStatus, Long> roomStatusCounts = roomRepository.findAll().stream()
                .map(Room::getStatus)
                .filter(s -> s != null)
                .collect(Collectors.groupingBy(s -> s, Collectors.counting()));
        List<Map<String, Object>> facilityStatusBreakdown = roomStatusCounts.entrySet().stream()
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name", e.getKey().name());
                    m.put("value", e.getValue());
                    return m;
                }).collect(Collectors.toList());

        List<Map<String, Object>> todayBookings = todayReservations.stream()
                .map(r -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("title", r.getTitle());
                    m.put("status", r.getStatus().name());
                    m.put("room", r.getRoom() != null ? r.getRoom().getName() : "Unknown");
                    m.put("time", r.getStartTime().toLocalTime() + " - " + r.getEndTime().toLocalTime());
                    return m;
                }).collect(Collectors.toList());

        List<Map<String, Object>> maintenanceTasks = maintenanceScheduleRepository
                .findByStartTimeBetween(todayStart, todayEnd).stream()
                .map(m -> {
                    Map<String, Object> t = new LinkedHashMap<>();
                    t.put("task", m.getTitle());
                    t.put("priority", m.getStatus() == MaintenanceStatus.IN_PROGRESS ? "HIGH"
                            : m.getStatus() == MaintenanceStatus.SCHEDULED ? "MEDIUM" : "LOW");
                    t.put("location", m.getRoom() != null ? m.getRoom().getName() : "Unknown");
                    t.put("dueDate", m.getStartTime().toLocalDate().toString());
                    return t;
                }).collect(Collectors.toList());

        List<Map<String, Object>> facilityInventory = equipmentRepository.findAll().stream()
                .map(e -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("name", e.getName());
                    item.put("status", e.getStatus().name());
                    item.put("quantity", 1);
                    item.put("location", e.getRoom() != null ? e.getRoom().getName() : "Unassigned");
                    return item;
                }).collect(Collectors.toList());

        Map<String, Object> charts = new LinkedHashMap<>();
        charts.put("dailyReservationLoad", dailyReservationLoad);
        charts.put("facilityStatusBreakdown", facilityStatusBreakdown);

        Map<String, Object> tables = new LinkedHashMap<>();
        tables.put("todayBookings", todayBookings);
        tables.put("maintenanceTasks", maintenanceTasks);
        tables.put("facilityInventory", facilityInventory);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("kpi", kpi);
        result.put("charts", charts);
        result.put("tables", tables);
        return ResponseEntity.ok(ApiResponse.success(result, "Dashboard summary fetched successfully"));
    }

    @GetMapping("/reservations")
    @Operation(summary = "List my reservation requests")
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getMyReservations(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        if (user == null) return ResponseEntity.status(401).body(ApiResponse.failure("User not found", "USER_NOT_FOUND"));

        List<Map<String, Object>> items = reservationRepository.findByReservedById(user.getId()).stream()
                .map(r -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", r.getId());
                    m.put("title", r.getTitle());
                    m.put("description", r.getDescription());
                    m.put("startTime", r.getStartTime());
                    m.put("endTime", r.getEndTime());
                    m.put("status", r.getStatus());
                    m.put("expectedAttendees", r.getExpectedAttendees());
                    m.put("rejectionReason", r.getRejectionReason());
                    m.put("roomId", r.getRoom().getId());
                    m.put("roomName", r.getRoom().getName());
                    m.put("roomNumber", r.getRoom().getRoomNumber());
                    m.put("floorNumber", r.getRoom().getFloorNumber());
                    m.put("facilityName", r.getRoom().getFacility().getName());
                    m.put("facilityCode", r.getRoom().getFacility().getCode());
                    m.put("createdAt", r.getCreatedAt());
                    return m;
                }).toList();
        return ResponseEntity.ok(ApiResponse.success(items, "Reservations fetched successfully"));
    }

    @PostMapping("/reservations")
    @Operation(summary = "Submit a reservation request for approval")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createReservation(
            @RequestBody Map<String, Object> request,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        if (user == null) return ResponseEntity.status(401).body(ApiResponse.failure("User not found", "USER_NOT_FOUND"));

        UUID roomId = UUID.fromString((String) request.get("roomId"));
        Room room = roomRepository.findById(roomId).orElse(null);
        if (room == null) return ResponseEntity.badRequest().body(ApiResponse.failure("Room not found", "ROOM_NOT_FOUND"));
        if (!Boolean.TRUE.equals(room.getActive())) {
            return ResponseEntity.badRequest().body(ApiResponse.failure("This room is not active and cannot be reserved.", "ROOM_INACTIVE"));
        }

        LocalDateTime start = LocalDateTime.parse((String) request.get("startTime"));
        LocalDateTime end = LocalDateTime.parse((String) request.get("endTime"));

        if (!end.isAfter(start)) {
            return ResponseEntity.badRequest().body(ApiResponse.failure("End time must be after start time.", "INVALID_RANGE"));
        }
        if (start.isBefore(LocalDateTime.now())) {
            return ResponseEntity.badRequest().body(ApiResponse.failure("Reservation cannot be in the past.", "PAST_TIME"));
        }

        boolean withinHours = true;
        if (room.getOpenTime() != null && room.getCloseTime() != null) {
            withinHours = !start.toLocalTime().isBefore(room.getOpenTime()) && !end.toLocalTime().isAfter(room.getCloseTime());
        }
        if (!withinHours) {
            return ResponseEntity.badRequest().body(ApiResponse.failure(
                    "Selected time is outside the room's operating hours (" + room.getOpenTime() + " - " + room.getCloseTime() + ").",
                    "OUTSIDE_OPERATING_HOURS"));
        }

        boolean maintenanceBlocked = room.getStatus() == RoomStatus.MAINTENANCE
                || room.getStatus() == RoomStatus.OUT_OF_SERVICE
                || !maintenanceScheduleRepository.findOverlappingMaintenance(room.getId(), start, end).isEmpty();
        if (maintenanceBlocked) {
            return ResponseEntity.badRequest().body(ApiResponse.failure("This room is under maintenance for the selected timeframe.", "UNDER_MAINTENANCE"));
        }

        List<Reservation> conflicts = reservationRepository.findConflictingReservations(room.getId(), start, end);
        if (!conflicts.isEmpty()) {
            Reservation conflict = conflicts.get(0);
            return ResponseEntity.badRequest().body(ApiResponse.failure(
                    "Room is already reserved for the selected timeframe (" + conflict.getStartTime() + " - " + conflict.getEndTime() + ").",
                    "CONFLICT"));
        }

        Reservation reservation = Reservation.builder()
                .room(room)
                .reservedBy(user)
                .title((String) request.getOrDefault("title", "Room Reservation"))
                .description((String) request.get("description"))
                .startTime(start)
                .endTime(end)
                .status(ReservationStatus.PENDING)
                .expectedAttendees(request.get("expectedAttendees") != null
                        ? Integer.parseInt(String.valueOf(request.get("expectedAttendees")))
                        : null)
                .build();

        Reservation saved = reservationRepository.save(reservation);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", saved.getId());
        result.put("title", saved.getTitle());
        result.put("startTime", saved.getStartTime());
        result.put("endTime", saved.getEndTime());
        result.put("status", saved.getStatus());
        result.put("roomId", saved.getRoom().getId());
        result.put("roomName", saved.getRoom().getName());
        return ResponseEntity.ok(ApiResponse.success(result, "Reservation request submitted for approval"));
    }

    @PostMapping("/reservations/{id}/cancel")
    @Operation(summary = "Cancel my own reservation request")
    public ResponseEntity<ApiResponse<Map<String, Object>>> cancelReservation(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        if (user == null) return ResponseEntity.status(401).body(ApiResponse.failure("User not found", "USER_NOT_FOUND"));

        Reservation reservation = reservationRepository.findById(id).orElse(null);
        if (reservation == null) return ResponseEntity.notFound().build();
        if (!reservation.getReservedBy().getId().equals(user.getId())) {
            return ResponseEntity.status(403).body(ApiResponse.failure("You can only cancel your own reservations.", "FORBIDDEN"));
        }
        if (reservation.getStatus() == ReservationStatus.APPROVED
                || reservation.getStatus() == ReservationStatus.CHECKED_IN
                || reservation.getStatus() == ReservationStatus.COMPLETED) {
            return ResponseEntity.badRequest().body(ApiResponse.failure(
                    "A " + reservation.getStatus().name().toLowerCase() + " reservation cannot be cancelled by the requester.",
                    "INVALID_STATUS"));
        }

        reservation.setStatus(ReservationStatus.CANCELLED);
        Reservation saved = reservationRepository.save(reservation);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", saved.getId());
        result.put("status", saved.getStatus());
        return ResponseEntity.ok(ApiResponse.success(result, "Reservation cancelled successfully"));
    }

    @PostMapping("/ai/suggest")
    @Operation(summary = "AI room suggestions from a natural-language or structured request")
    public ResponseEntity<ApiResponse<Map<String, Object>>> aiSuggestRooms(@RequestBody Map<String, Object> request) {
        String naturalLanguage = (String) request.getOrDefault("query", "");
        LocalDate date = LocalDate.parse((String) request.get("date"));
        LocalTime start = LocalTime.parse((String) request.get("startTime"));
        LocalTime end = LocalTime.parse((String) request.get("endTime"));
        Integer limit = request.get("limit") != null ? Integer.parseInt(String.valueOf(request.get("limit"))) : 5;

        Map<String, Object> result = reservationAiService.suggestRooms(naturalLanguage, date, start, end, limit);
        return ResponseEntity.ok(ApiResponse.success(result, "AI room suggestions generated"));
    }

    @PostMapping("/ai/draft")
    @Operation(summary = "Parse natural-language text into a structured reservation draft")
    public ResponseEntity<ApiResponse<Map<String, Object>>> aiDraftReservation(@RequestBody Map<String, Object> request) {
        String text = (String) request.getOrDefault("text", "");
        return ResponseEntity.ok(ApiResponse.success(reservationAiService.draftReservation(text),
                "Reservation draft generated from text"));
    }

    @PostMapping("/ai/validate")
    @Operation(summary = "Pre-submit AI validation with policy warnings and alternative slots")
    public ResponseEntity<ApiResponse<Map<String, Object>>> aiValidateReservation(@RequestBody Map<String, Object> request) {
        UUID roomId = UUID.fromString((String) request.get("roomId"));
        LocalDateTime start = ReservationAiService.parseDateTime((String) request.get("startTime"));
        LocalDateTime end = ReservationAiService.parseDateTime((String) request.get("endTime"));
        Integer expectedAttendees = request.get("expectedAttendees") != null
                ? Integer.parseInt(String.valueOf(request.get("expectedAttendees")))
                : null;

        Map<String, Object> result = reservationAiService.validateReservation(roomId, start, end, expectedAttendees);
        return ResponseEntity.ok(ApiResponse.success(result, "Reservation validated with AI"));
    }

    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) return null;
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }
}
