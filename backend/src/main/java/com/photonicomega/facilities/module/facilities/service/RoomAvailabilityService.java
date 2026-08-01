package com.photonicomega.facilities.module.facilities.service;

import com.photonicomega.facilities.module.facilities.domain.*;
import com.photonicomega.facilities.module.facilities.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RoomAvailabilityService {

    private final RoomRepository roomRepository;
    private final ReservationRepository reservationRepository;
    private final MaintenanceScheduleRepository maintenanceScheduleRepository;

    public Map<String, Object> findAvailableRooms(
            LocalDate date,
            LocalTime start,
            LocalTime end,
            String facilityId,
            String facilityType,
            String building,
            Integer floor,
            Integer minCapacity,
            RoomType roomType,
            String availability) {

        LocalDateTime startDateTime = date.atTime(start);
        LocalDateTime endDateTime = date.atTime(end);

        List<Room> rooms = roomRepository.findByActiveTrue().stream()
                .filter(r -> facilityId == null || facilityId.isBlank() || r.getFacility().getId().toString().equals(facilityId))
                .filter(r -> facilityType == null || facilityType.isBlank() || r.getFacility().getType().name().equalsIgnoreCase(facilityType))
                .filter(r -> building == null || building.isBlank() || (r.getBuilding() != null && r.getBuilding().equalsIgnoreCase(building)))
                .filter(r -> floor == null || (r.getFloorNumber() != null && r.getFloorNumber().equals(floor)))
                .filter(r -> minCapacity == null || (r.getCapacity() != null && r.getCapacity() >= minCapacity))
                .filter(r -> roomType == null || r.getType() == roomType)
                .collect(Collectors.toList());

        List<Map<String, Object>> items = new ArrayList<>();
        int available = 0;
        int occupied = 0;
        int maintenance = 0;
        int outOfService = 0;
        int closed = 0;

        for (Room room : rooms) {
            Map<String, Object> m = buildRoomMap(room);
            boolean withinHours = withinOperatingHours(room, start, end);

            List<Reservation> conflicts = reservationRepository.findConflictingReservations(
                    room.getId(), startDateTime, endDateTime);
            List<MaintenanceSchedule> maintenanceOverlaps = maintenanceScheduleRepository
                    .findOverlappingMaintenance(room.getId(), startDateTime, endDateTime);

            boolean maintenanceBlocked = !maintenanceOverlaps.isEmpty()
                    || room.getStatus() == RoomStatus.MAINTENANCE
                    || room.getStatus() == RoomStatus.OUT_OF_SERVICE;

            String status;
            if (room.getStatus() == RoomStatus.OUT_OF_SERVICE) {
                status = "OUT_OF_SERVICE";
                outOfService++;
            } else if (maintenanceBlocked) {
                status = "MAINTENANCE";
                maintenance++;
            } else if (!conflicts.isEmpty()) {
                status = "OCCUPIED";
                occupied++;
                Reservation conflict = conflicts.get(0);
                m.put("occupiedBy", conflict.getTitle());
                m.put("occupiedUntil", conflict.getEndTime());
            } else if (!withinHours) {
                status = "CLOSED";
                closed++;
            } else {
                status = "AVAILABLE";
                available++;
            }

            m.put("availability", status);
            m.put("selectable", "AVAILABLE".equals(status));
            m.put("withinOperatingHours", withinHours);

            if (availability == null || availability.isBlank() || status.equalsIgnoreCase(availability)) {
                items.add(m);
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", rooms.size());
        summary.put("available", available);
        summary.put("occupied", occupied);
        summary.put("maintenance", maintenance);
        summary.put("outOfService", outOfService);
        summary.put("closed", closed);
        summary.put("startDateTime", startDateTime);
        summary.put("endDateTime", endDateTime);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("summary", summary);
        result.put("rooms", items);
        return result;
    }

    public Map<String, Object> getFilterOptions() {
        List<Room> rooms = roomRepository.findByActiveTrue();

        List<Map<String, Object>> facilities = rooms.stream()
                .map(Room::getFacility)
                .filter(Objects::nonNull)
                .distinct()
                .map(f -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", f.getId());
                    m.put("name", f.getName());
                    m.put("code", f.getCode());
                    m.put("type", f.getType());
                    return m;
                })
                .collect(Collectors.toList());

        List<String> buildings = rooms.stream()
                .map(Room::getBuilding)
                .filter(Objects::nonNull)
                .filter(b -> !b.isBlank())
                .distinct()
                .sorted()
                .collect(Collectors.toList());

        List<Integer> floors = rooms.stream()
                .map(Room::getFloorNumber)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .collect(Collectors.toList());

        List<RoomType> roomTypes = rooms.stream()
                .map(Room::getType)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("facilities", facilities);
        result.put("buildings", buildings);
        result.put("floors", floors);
        result.put("roomTypes", roomTypes);
        result.put("statuses", List.of("AVAILABLE", "OCCUPIED", "MAINTENANCE", "OUT_OF_SERVICE", "CLOSED"));
        return result;
    }

    private Map<String, Object> buildRoomMap(Room room) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", room.getId());
        m.put("name", room.getName());
        m.put("roomNumber", room.getRoomNumber());
        m.put("type", room.getType());
        m.put("floorNumber", room.getFloorNumber());
        m.put("building", room.getBuilding());
        m.put("capacity", room.getCapacity());
        m.put("openTime", room.getOpenTime());
        m.put("closeTime", room.getCloseTime());
        m.put("status", room.getStatus());
        m.put("hasProjector", room.getHasProjector());
        m.put("hasVideoConference", room.getHasVideoConference());
        m.put("hasWhiteboard", room.getHasWhiteboard());
        m.put("facilityId", room.getFacility().getId());
        m.put("facilityName", room.getFacility().getName());
        m.put("facilityCode", room.getFacility().getCode());
        m.put("facilityType", room.getFacility().getType());
        m.put("amenities", room.getAmenities().stream()
                .map(RoomAmenity::getName)
                .collect(Collectors.toList()));
        return m;
    }

    private boolean withinOperatingHours(Room room, LocalTime start, LocalTime end) {
        if (room.getOpenTime() == null || room.getCloseTime() == null) return true;
        return !start.isBefore(room.getOpenTime()) && !end.isAfter(room.getCloseTime());
    }
}
