package com.photonicomega.facilities.module.facilities.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.facilities.ai.ReservationAiService;
import com.photonicomega.facilities.module.facilities.domain.*;
import com.photonicomega.facilities.module.facilities.repository.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/v1/facilities-manager")
@RequiredArgsConstructor
@Tag(name = "Facilities Manager", description = "Facilities Manager dashboard and operations")
public class FacilitiesManagerController {

    private final FacilityRepository facilityRepository;
    private final RoomRepository roomRepository;
    private final ReservationRepository reservationRepository;
    private final EquipmentRepository equipmentRepository;
    private final ReservationApprovalRepository reservationApprovalRepository;
    private final MaintenanceScheduleRepository maintenanceScheduleRepository;
    private final RoomAmenityRepository roomAmenityRepository;
    private final ReservationAiService reservationAiService;

    @GetMapping("/dashboard/kpi")
    @Operation(summary = "Dashboard KPI cards")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDashboardKpi() {
        long totalRooms = roomRepository.count();
        long availableRooms = roomRepository.countByActiveTrue();
        long occupiedRooms = totalRooms - availableRooms;

        LocalDate today = LocalDate.now();
        LocalDateTime todayStart = today.atStartOfDay();
        LocalDateTime todayEnd = today.atTime(LocalTime.MAX);

        long activeReservations = reservationRepository.countByStatus(ReservationStatus.APPROVED);
        long pendingApprovals = reservationRepository.countByStatus(ReservationStatus.PENDING);
        long todaysReservations = reservationRepository.countByDateRange(todayStart, todayEnd);

        long totalAssets = equipmentRepository.count();
        long maintenanceAssets = equipmentRepository.countByStatus(EquipmentStatus.UNDER_MAINTENANCE);

        double utilizationRate = totalRooms > 0 ? ((double) occupiedRooms / totalRooms) * 100 : 0;

        Map<String, Object> kpi = new LinkedHashMap<>();
        kpi.put("activeReservations", activeReservations);
        kpi.put("pendingApprovals", pendingApprovals);
        kpi.put("availableRooms", availableRooms);
        kpi.put("occupiedRooms", occupiedRooms);
        kpi.put("maintenanceRooms", 0L);
        kpi.put("totalAssets", totalAssets);
        kpi.put("assetUtilizationRate", Math.round(utilizationRate * 10.0) / 10.0);
        kpi.put("todaysReservations", todaysReservations);
        return ResponseEntity.ok(ApiResponse.success(kpi));
    }

    @GetMapping("/reservations")
    @Operation(summary = "List reservations with optional filters")
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getReservations(
            @RequestParam(required = false) ReservationStatus status,
            @RequestParam(required = false) UUID roomId,
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) String building,
            @RequestParam(required = false) Integer floor,
            @RequestParam(required = false) LocalDate date) {

        // Honor the optional filters. Callers (e.g. the approval queue requesting
        // status=PENDING) rely on server-side filtering; without this every
        // reservation is returned regardless of status, so actioned items keep
        // reappearing in the pending queue after the ~3s realtime refetch.
        List<Reservation> all = reservationRepository.findAll().stream()
                .filter(r -> status   == null || r.getStatus() == status)
                .filter(r -> roomId   == null || r.getRoom().getId().equals(roomId))
                .filter(r -> userId   == null || r.getReservedBy().getId().equals(userId))
                .filter(r -> building == null || building.equalsIgnoreCase(r.getRoom().getBuilding()))
                .filter(r -> floor    == null || floor.equals(r.getRoom().getFloorNumber()))
                .filter(r -> date     == null || r.getStartTime().toLocalDate().equals(date))
                .toList();

        List<Map<String, Object>> reservations = all.stream().map(r -> {
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
            m.put("employeeId", r.getReservedBy().getEmployeeId());
            m.put("employeeName", r.getReservedBy().getFullName());
            m.put("employeeDepartment", r.getReservedBy().getDepartment());
            m.put("employeeEmail", r.getReservedBy().getEmail());
            m.put("createdAt", r.getCreatedAt());
            return m;
        }).collect(Collectors.toList());

        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("pending", reservationRepository.countByStatus(ReservationStatus.PENDING));
        overview.put("approved", reservationRepository.countByStatus(ReservationStatus.APPROVED));
        overview.put("rejected", reservationRepository.countByStatus(ReservationStatus.REJECTED));
        overview.put("cancelled", reservationRepository.countByStatus(ReservationStatus.CANCELLED));

        LocalDate today = LocalDate.now();
        overview.put("todaysReservations", reservationRepository.countByDateRange(today.atStartOfDay(), today.atTime(LocalTime.MAX)));
        overview.put("upcomingReservations", reservationRepository.countByDateRange(today.atStartOfDay(), today.plusDays(30).atTime(LocalTime.MAX)));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("overview", overview);
        result.put("reservations", reservations);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PostMapping("/reservations/{id}/approve")
    @Operation(summary = "Approve a pending reservation")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approveReservation(
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, String> body) {
        Reservation r = reservationRepository.findById(id).orElse(null);
        if (r == null) return ResponseEntity.notFound().build();

        List<Reservation> conflicts = reservationRepository.findConflictingReservations(
                r.getRoom().getId(), r.getStartTime(), r.getEndTime());
        boolean stillValid = conflicts.stream()
                .noneMatch(c -> !c.getId().equals(r.getId()) && c.getStatus() == ReservationStatus.APPROVED);
        if (!stillValid) {
            r.setStatus(ReservationStatus.REJECTED);
            r.setRejectionReason("Another reservation for this room in the same timeframe was approved first.");
            reservationRepository.save(r);
            return ResponseEntity.badRequest().body(ApiResponse.failure(
                    "Room was already approved for another booking in this timeframe. Reservation rejected.",
                    "CONFLICT"));
        }

        r.setStatus(ReservationStatus.APPROVED);
        r.setRejectionReason(null);
        reservationRepository.save(r);

        recordApproval(r, "APPROVED", body != null ? body.get("comments") : null);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", r.getId(), "status", r.getStatus())));
    }

    @PostMapping("/reservations/{id}/reject")
    @Operation(summary = "Reject a pending reservation")
    public ResponseEntity<ApiResponse<Map<String, Object>>> rejectReservation(
            @PathVariable UUID id, @RequestBody(required = false) Map<String, String> body) {
        Reservation r = reservationRepository.findById(id).orElse(null);
        if (r == null) return ResponseEntity.notFound().build();
        r.setStatus(ReservationStatus.REJECTED);
        r.setRejectionReason(body != null ? body.getOrDefault("reason", "Rejected by facilities manager") : "Rejected by facilities manager");
        reservationRepository.save(r);

        recordApproval(r, "REJECTED", body != null ? body.getOrDefault("reason", null) : null);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", r.getId(), "status", r.getStatus())));
    }

    @PostMapping("/reservations/{id}/ai/approval-suggest")
    @Operation(summary = "AI recommendation for approving/rejecting a pending reservation")
    public ResponseEntity<ApiResponse<Map<String, Object>>> aiSuggestApproval(@PathVariable UUID id) {
        Map<String, Object> result = reservationAiService.suggestApproval(id);
        return ResponseEntity.ok(ApiResponse.success(result, "AI approval recommendation generated"));
    }

    private void recordApproval(Reservation reservation, String decision, String comments) {
        ReservationApproval approval = ReservationApproval.builder()
                .reservation(reservation)
                .decision(decision)
                .comments(comments)
                .decidedAt(java.time.LocalDateTime.now())
                .build();
        reservationApprovalRepository.save(approval);
    }

    @GetMapping("/rooms/summary")
    @Operation(summary = "Room management summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRoomSummary() {
        long total = roomRepository.count();
        long available = roomRepository.countByActiveTrue();
        long occupied = total - available;

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalRooms", total);
        summary.put("availableRooms", available);
        summary.put("occupiedRooms", occupied);
        summary.put("reservedRooms", occupied);
        summary.put("maintenanceRooms", 0L);
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @GetMapping("/rooms")
    @Operation(summary = "List all rooms with facility info")
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAllRooms() {
        List<Map<String, Object>> rooms = roomRepository.findAll().stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("name", r.getName());
            m.put("roomNumber", r.getRoomNumber());
            m.put("floorNumber", r.getFloorNumber());
            m.put("building", r.getBuilding());
            m.put("capacity", r.getCapacity());
            m.put("type", r.getType());
            m.put("status", r.getStatus());
            m.put("openTime", r.getOpenTime());
            m.put("closeTime", r.getCloseTime());
            m.put("active", r.getActive());
            m.put("hasProjector", r.getHasProjector());
            m.put("hasVideoConference", r.getHasVideoConference());
            m.put("hasWhiteboard", r.getHasWhiteboard());
            m.put("amenities", r.getAmenities().stream().map(RoomAmenity::getName).collect(Collectors.toList()));
            m.put("facilityId", r.getFacility().getId());
            m.put("facilityName", r.getFacility().getName());
            m.put("facilityCode", r.getFacility().getCode());
            m.put("createdAt", r.getCreatedAt());
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(rooms));
    }

    @PostMapping("/rooms")
    @Operation(summary = "Create a room with amenities")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRoom(@RequestBody Map<String, Object> body) {
        UUID facilityId = UUID.fromString((String) body.get("facilityId"));
        Facility facility = facilityRepository.findById(facilityId).orElse(null);
        if (facility == null) return ResponseEntity.badRequest().body(ApiResponse.failure("Facility not found", "FACILITY_NOT_FOUND"));

        Room room = Room.builder()
                .facility(facility)
                .name((String) body.get("name"))
                .roomNumber((String) body.getOrDefault("roomNumber", ""))
                .type(RoomType.valueOf((String) body.get("type")))
                .floorNumber(body.get("floorNumber") != null ? Integer.parseInt(String.valueOf(body.get("floorNumber"))) : null)
                .building((String) body.get("building"))
                .capacity(body.get("capacity") != null ? Integer.parseInt(String.valueOf(body.get("capacity"))) : null)
                .openTime(body.get("openTime") != null ? java.time.LocalTime.parse((String) body.get("openTime")) : null)
                .closeTime(body.get("closeTime") != null ? java.time.LocalTime.parse((String) body.get("closeTime")) : null)
                .status(body.get("status") != null ? RoomStatus.valueOf((String) body.get("status")) : RoomStatus.VACANT)
                .hasProjector(body.get("hasProjector") != null && Boolean.parseBoolean(String.valueOf(body.get("hasProjector"))))
                .hasVideoConference(body.get("hasVideoConference") != null && Boolean.parseBoolean(String.valueOf(body.get("hasVideoConference"))))
                .hasWhiteboard(body.get("hasWhiteboard") != null && Boolean.parseBoolean(String.valueOf(body.get("hasWhiteboard"))))
                .active(body.get("active") == null || Boolean.parseBoolean(String.valueOf(body.get("active"))))
                .build();

        Room saved = roomRepository.save(room);

        if (body.get("amenities") instanceof List<?> amenities) {
            for (Object a : amenities) {
                if (a == null) continue;
                roomAmenityRepository.save(RoomAmenity.builder()
                        .room(saved)
                        .name(String.valueOf(a))
                        .build());
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", saved.getId());
        result.put("name", saved.getName());
        result.put("roomNumber", saved.getRoomNumber());
        result.put("floorNumber", saved.getFloorNumber());
        result.put("building", saved.getBuilding());
        result.put("capacity", saved.getCapacity());
        result.put("type", saved.getType());
        result.put("status", saved.getStatus());
        result.put("openTime", saved.getOpenTime());
        result.put("closeTime", saved.getCloseTime());
        result.put("active", saved.getActive());
        result.put("facilityId", saved.getFacility().getId());
        result.put("facilityName", saved.getFacility().getName());
        result.put("amenities", saved.getAmenities().stream().map(RoomAmenity::getName).collect(Collectors.toList()));
        return ResponseEntity.ok(ApiResponse.success(result, "Room created successfully"));
    }

    @PutMapping("/rooms/{id}")
    @Operation(summary = "Update room details")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<ApiResponse<Room>> updateRoom(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body) {
        Room room = roomRepository.findById(id).orElse(null);
        if (room == null) return ResponseEntity.notFound().build();

        if (body.containsKey("name")) room.setName((String) body.get("name"));
        if (body.containsKey("roomNumber")) room.setRoomNumber((String) body.get("roomNumber"));
        if (body.containsKey("type")) room.setType(RoomType.valueOf((String) body.get("type")));
        if (body.containsKey("floorNumber")) room.setFloorNumber(Integer.parseInt(String.valueOf(body.get("floorNumber"))));
        if (body.containsKey("building")) room.setBuilding((String) body.get("building"));
        if (body.containsKey("capacity")) room.setCapacity(Integer.parseInt(String.valueOf(body.get("capacity"))));
        if (body.containsKey("openTime")) room.setOpenTime(java.time.LocalTime.parse((String) body.get("openTime")));
        if (body.containsKey("closeTime")) room.setCloseTime(java.time.LocalTime.parse((String) body.get("closeTime")));
        if (body.containsKey("status")) room.setStatus(RoomStatus.valueOf((String) body.get("status")));
        if (body.containsKey("hasProjector")) room.setHasProjector(Boolean.parseBoolean(String.valueOf(body.get("hasProjector"))));
        if (body.containsKey("hasVideoConference")) room.setHasVideoConference(Boolean.parseBoolean(String.valueOf(body.get("hasVideoConference"))));
        if (body.containsKey("hasWhiteboard")) room.setHasWhiteboard(Boolean.parseBoolean(String.valueOf(body.get("hasWhiteboard"))));
        if (body.containsKey("active")) room.setActive(Boolean.parseBoolean(String.valueOf(body.get("active"))));

        return ResponseEntity.ok(ApiResponse.success(roomRepository.save(room), "Room updated successfully"));
    }

    @PostMapping("/rooms/{id}/maintenance")
    @Operation(summary = "Schedule maintenance for a room")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> scheduleMaintenance(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body) {
        Room room = roomRepository.findById(id).orElse(null);
        if (room == null) return ResponseEntity.notFound().build();

        MaintenanceSchedule schedule = MaintenanceSchedule.builder()
                .room(room)
                .title((String) body.getOrDefault("title", "Scheduled Maintenance"))
                .description((String) body.get("description"))
                .startTime(java.time.LocalDateTime.parse((String) body.get("startTime")))
                .endTime(java.time.LocalDateTime.parse((String) body.get("endTime")))
                .status(MaintenanceStatus.SCHEDULED)
                .assignedTo((String) body.get("assignedTo"))
                .notes((String) body.get("notes"))
                .build();
        MaintenanceSchedule saved = maintenanceScheduleRepository.save(schedule);

        if (body.get("markUnavailable") == null || Boolean.parseBoolean(String.valueOf(body.get("markUnavailable")))) {
            room.setStatus(RoomStatus.MAINTENANCE);
            roomRepository.save(room);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", saved.getId());
        result.put("title", saved.getTitle());
        result.put("description", saved.getDescription());
        result.put("startTime", saved.getStartTime());
        result.put("endTime", saved.getEndTime());
        result.put("status", saved.getStatus());
        result.put("assignedTo", saved.getAssignedTo());
        result.put("roomId", saved.getRoom().getId());
        result.put("roomName", saved.getRoom().getName());
        return ResponseEntity.ok(ApiResponse.success(result, "Maintenance scheduled successfully"));
    }

    @GetMapping("/maintenance")
    @Operation(summary = "List maintenance schedules")
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getMaintenanceSchedules() {
        List<Map<String, Object>> items = maintenanceScheduleRepository.findAll().stream().map(m -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", m.getId());
            map.put("title", m.getTitle());
            map.put("description", m.getDescription());
            map.put("startTime", m.getStartTime());
            map.put("endTime", m.getEndTime());
            map.put("status", m.getStatus());
            map.put("assignedTo", m.getAssignedTo());
            map.put("roomId", m.getRoom() != null ? m.getRoom().getId() : null);
            map.put("roomName", m.getRoom() != null ? m.getRoom().getName() : null);
            return map;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(items));
    }

    @GetMapping("/assets")
    @Operation(summary = "Asset overview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getAssetOverview() {
        long total = equipmentRepository.count();
        long maintenanceCount = equipmentRepository.countByStatus(EquipmentStatus.UNDER_MAINTENANCE);
        long activeCount = equipmentRepository.countByStatus(EquipmentStatus.AVAILABLE);
        long retiredCount = equipmentRepository.countByStatus(EquipmentStatus.DECOMMISSIONED);

        List<Equipment> all = equipmentRepository.findAll();
        Map<String, Long> categoryCount = all.stream()
                .filter(e -> e.getCategory() != null)
                .collect(Collectors.groupingBy(Equipment::getCategory, Collectors.counting()));

        double utilRate = total > 0 ? ((double) activeCount / total) * 100 : 0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalAssets", total);
        result.put("activeAssets", activeCount);
        result.put("maintenanceAssets", maintenanceCount);
        result.put("retiredAssets", retiredCount);
        result.put("categories", categoryCount);
        result.put("utilizationRate", Math.round(utilRate * 10.0) / 10.0);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/assets/list")
    @Operation(summary = "List all equipment/assets")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listAssets() {
        List<Map<String, Object>> assets = equipmentRepository.findAll().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId());
            m.put("name", e.getName());
            m.put("serialNumber", e.getSerialNumber());
            m.put("category", e.getCategory());
            m.put("status", e.getStatus());
            m.put("lastMaintenanceDate", e.getLastMaintenanceDate());
            m.put("nextMaintenanceDate", e.getNextMaintenanceDate());
            m.put("roomId", e.getRoom() != null ? e.getRoom().getId() : null);
            m.put("roomName", e.getRoom() != null ? e.getRoom().getName() : null);
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(assets));
    }

    @GetMapping("/calendar")
    @Operation(summary = "Calendar events (reservations + maintenance)")
    // Reservation.room / .reservedBy and MaintenanceSchedule.room are LAZY and
    // open-in-view is disabled, so building the event DTOs below would hit a
    // detached proxy ("could not initialize proxy - no Session") and 500.
    // Same read-only transaction the other list endpoints in this controller use.
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getCalendar(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        LocalDate start = year != null && month != null
                ? LocalDate.of(year, month, 1)
                : LocalDate.now().withDayOfMonth(1);
        LocalDate end = start.plusMonths(1).minusDays(1);

        List<Reservation> reservations = reservationRepository.findByStartTimeBetween(
                start.atStartOfDay(), end.atTime(LocalTime.MAX));

        List<Map<String, Object>> events = new ArrayList<>(reservations.stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("title", r.getTitle());
            m.put("start", r.getStartTime().toString());
            m.put("end", r.getEndTime().toString());
            m.put("type", "reservation");
            m.put("roomName", r.getRoom().getName());
            m.put("status", r.getStatus());
            m.put("employeeName", r.getReservedBy().getFullName());
            return m;
        }).collect(Collectors.toList()));

        List<MaintenanceSchedule> maintenance = maintenanceScheduleRepository.findByStartTimeBetween(
                start.atStartOfDay(), end.atTime(LocalTime.MAX));
        maintenance.stream().map(m -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", m.getId());
            map.put("title", m.getTitle());
            map.put("start", m.getStartTime().toString());
            map.put("end", m.getEndTime().toString());
            map.put("type", "maintenance");
            map.put("roomName", m.getRoom() != null ? m.getRoom().getName() : "");
            map.put("status", m.getStatus());
            return map;
        }).forEach(events::add);

        return ResponseEntity.ok(ApiResponse.success(events));
    }

    @GetMapping("/analytics")
    @Operation(summary = "Analytics data for charts")
    // Groups reservations by Reservation.reservedBy.department and
    // Room.facility.name, both LAZY - needs an open session for the same
    // reason as /calendar.
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getAnalytics() {
        LocalDate today = LocalDate.now();

        List<Reservation> monthReservations = reservationRepository.findByStartTimeBetween(
                today.withDayOfMonth(1).atStartOfDay(),
                today.withDayOfMonth(today.lengthOfMonth()).atTime(LocalTime.MAX));

        Map<LocalDate, Long> dailyUtilization = monthReservations.stream()
                .collect(Collectors.groupingBy(r -> r.getStartTime().toLocalDate(), Collectors.counting()));

        Map<Integer, Long> peakHours = monthReservations.stream()
                .collect(Collectors.groupingBy(r -> r.getStartTime().getHour(), Collectors.counting()));

        Map<String, Long> departmentDistribution = monthReservations.stream()
                .filter(r -> r.getReservedBy().getDepartment() != null)
                .collect(Collectors.groupingBy(r -> r.getReservedBy().getDepartment(), Collectors.counting()));

        Map<UUID, Long> roomFrequency = monthReservations.stream()
                .collect(Collectors.groupingBy(r -> r.getRoom().getId(), Collectors.counting()));

        List<Map<String, Object>> topRooms = roomFrequency.entrySet().stream()
                .sorted(Map.Entry.<UUID, Long>comparingByValue().reversed())
                .limit(10)
                .map(e -> {
                    Room room = roomRepository.findById(e.getKey()).orElse(null);
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("roomName", room != null ? room.getName() : "Unknown");
                    m.put("roomNumber", room != null ? room.getRoomNumber() : "");
                    m.put("facilityName", room != null ? room.getFacility().getName() : "");
                    m.put("count", e.getValue());
                    return m;
                }).collect(Collectors.toList());

        long totalAssets = equipmentRepository.count();
        long maintAssets = equipmentRepository.countByStatus(EquipmentStatus.UNDER_MAINTENANCE);
        double assetUtil = totalAssets > 0 ? ((double) (totalAssets - maintAssets) / totalAssets) * 100 : 0;

        List<Map<String, Object>> assetTrends = new ArrayList<>();
        Map<String, Long> assetCats = equipmentRepository.findAll().stream()
                .filter(e -> e.getCategory() != null)
                .collect(Collectors.groupingBy(Equipment::getCategory, Collectors.counting()));
        assetCats.forEach((cat, cnt) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("category", cat);
            m.put("count", cnt);
            assetTrends.add(m);
        });

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("dailyRoomUtilization", dailyUtilization);
        result.put("monthlyReservationTrends", Map.of("total", monthReservations.size()));
        result.put("peakReservationHours", peakHours);
        result.put("departmentDistribution", departmentDistribution);
        result.put("mostFrequentlyUsedRooms", topRooms);
        result.put("assetUtilizationTrends", Map.of("rate", Math.round(assetUtil * 10.0) / 10.0, "categories", assetTrends));
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/reports")
    @Operation(summary = "Report data endpoints")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getReports(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate) {
        LocalDate start = startDate != null ? startDate : LocalDate.now().minusMonths(1);
        LocalDate end = endDate != null ? endDate : LocalDate.now();

        List<Reservation> reservations = reservationRepository.findByStartTimeBetween(
                start.atStartOfDay(), end.atTime(LocalTime.MAX));

        long totalRooms = roomRepository.count();
        long available = roomRepository.countByActiveTrue();
        double occupancyRate = totalRooms > 0 ? ((double) (totalRooms - available) / totalRooms) * 100 : 0;

        long totalAssets = equipmentRepository.count();
        long activeAssets = equipmentRepository.countByStatus(EquipmentStatus.AVAILABLE);
        double assetUtilRate = totalAssets > 0 ? ((double) activeAssets / totalAssets) * 100 : 0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reservationReports", Map.of(
                "totalReservations", reservations.size(),
                "approved", reservations.stream().filter(r -> r.getStatus() == ReservationStatus.APPROVED).count(),
                "pending", reservations.stream().filter(r -> r.getStatus() == ReservationStatus.PENDING).count(),
                "rejected", reservations.stream().filter(r -> r.getStatus() == ReservationStatus.REJECTED).count(),
                "cancelled", reservations.stream().filter(r -> r.getStatus() == ReservationStatus.CANCELLED).count()
        ));
        result.put("facilityUtilization", Map.of(
                "totalRooms", totalRooms,
                "availableRooms", available,
                "occupancyRate", Math.round(occupancyRate * 10.0) / 10.0
        ));
        result.put("assetReports", Map.of(
                "totalAssets", totalAssets,
                "activeAssets", activeAssets,
                "assetUtilizationRate", Math.round(assetUtilRate * 10.0) / 10.0
        ));
        result.put("occupancyReports", Map.of(
                "totalRooms", totalRooms,
                "occupiedRooms", totalRooms - available,
                "occupancyRate", Math.round(occupancyRate * 10.0) / 10.0
        ));
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
