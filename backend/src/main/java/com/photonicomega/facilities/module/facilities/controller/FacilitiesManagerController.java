package com.photonicomega.facilities.module.facilities.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
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
    public ResponseEntity<ApiResponse<Map<String, Object>>> getReservations(
            @RequestParam(required = false) ReservationStatus status,
            @RequestParam(required = false) UUID roomId,
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) String building,
            @RequestParam(required = false) Integer floor,
            @RequestParam(required = false) LocalDate date) {

        List<Reservation> all = reservationRepository.findAll();

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
    public ResponseEntity<ApiResponse<Map<String, Object>>> approveReservation(@PathVariable UUID id) {
        Reservation r = reservationRepository.findById(id).orElse(null);
        if (r == null) return ResponseEntity.notFound().build();
        r.setStatus(ReservationStatus.APPROVED);
        r.setRejectionReason(null);
        reservationRepository.save(r);
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
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", r.getId(), "status", r.getStatus())));
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
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAllRooms() {
        List<Map<String, Object>> rooms = roomRepository.findAll().stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("name", r.getName());
            m.put("roomNumber", r.getRoomNumber());
            m.put("floorNumber", r.getFloorNumber());
            m.put("capacity", r.getCapacity());
            m.put("type", r.getType());
            m.put("active", r.getActive());
            m.put("hasProjector", r.getHasProjector());
            m.put("hasVideoConference", r.getHasVideoConference());
            m.put("hasWhiteboard", r.getHasWhiteboard());
            m.put("hourlyRate", r.getHourlyRate());
            m.put("facilityId", r.getFacility().getId());
            m.put("facilityName", r.getFacility().getName());
            m.put("facilityCode", r.getFacility().getCode());
            m.put("createdAt", r.getCreatedAt());
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(rooms));
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
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getCalendar(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        LocalDate start = year != null && month != null
                ? LocalDate.of(year, month, 1)
                : LocalDate.now().withDayOfMonth(1);
        LocalDate end = start.plusMonths(1).minusDays(1);

        List<Reservation> reservations = reservationRepository.findByStartTimeBetween(
                start.atStartOfDay(), end.atTime(LocalTime.MAX));

        List<Map<String, Object>> events = reservations.stream().map(r -> {
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
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(events));
    }

    @GetMapping("/analytics")
    @Operation(summary = "Analytics data for charts")
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
