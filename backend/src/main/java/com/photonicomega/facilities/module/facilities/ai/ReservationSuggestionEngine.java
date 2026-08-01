package com.photonicomega.facilities.module.facilities.ai;

import com.photonicomega.facilities.module.facilities.domain.Room;
import com.photonicomega.facilities.module.facilities.domain.RoomType;
import com.photonicomega.facilities.module.facilities.repository.MaintenanceScheduleRepository;
import com.photonicomega.facilities.module.facilities.repository.ReservationRepository;
import com.photonicomega.facilities.module.facilities.repository.RoomRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Deterministic AI heuristics for facility reservations. Operates entirely on real
 * reservation data (conflicts, maintenance, capacity, operating hours) and never
 * requires an external API key. Used as the source of truth for all safety-critical
 * checks; the optional LLM layer only enriches explanations.
 */
@Component
@RequiredArgsConstructor
public class ReservationSuggestionEngine {

    public static final int PEAK_HOUR_START = 10;
    public static final int PEAK_HOUR_END = 14;
    public static final int HIGH_CAPACITY_THRESHOLD = 50;

    private final RoomRepository roomRepository;
    private final ReservationRepository reservationRepository;
    private final MaintenanceScheduleRepository maintenanceScheduleRepository;

    public record ParsedQuery(
            Integer expectedAttendees,
            Integer requestedCapacity,
            Boolean requiresProjector,
            Boolean requiresVideoConference,
            Boolean requiresWhiteboard,
            RoomType roomType,
            String building,
            Integer floor,
            String facilityId
    ) {
        public static ParsedQuery empty() {
            return new ParsedQuery(null, null, null, null, null, null, null, null, null);
        }
    }

    public record RoomSuggestion(
            UUID roomId,
            String roomName,
            String roomNumber,
            String facilityName,
            String building,
            Integer floorNumber,
            Integer capacity,
            String roomType,
            int score,
            String matchReason,
            boolean hasProjector,
            boolean hasVideoConference,
            boolean hasWhiteboard,
            List<String> amenities
    ) {
    }

    public record PolicyWarning(
            String code,
            String severity,
            String message,
            Map<String, Object> details
    ) {
    }

    public record ParsedDraft(
            String title,
            String description,
            String date,
            String startTime,
            String endTime,
            Integer expectedAttendees,
            Integer requestedCapacity,
            Boolean requiresProjector,
            Boolean requiresVideoConference,
            Boolean requiresWhiteboard,
            String roomType,
            String building,
            List<String> detectedKeywords
    ) {
    }

    /**
     * Parses a free-text natural language query into structured search criteria.
     * Works for both room search ("30 people, projector, Tue 2-4pm") and
     * reservation drafts.
     */
    public ParsedQuery parseQuery(String text) {
        if (text == null || text.isBlank()) {
            return ParsedQuery.empty();
        }
        String lower = text.toLowerCase(Locale.ROOT);

        Integer attendees = extractCount(lower);
        Integer capacity = null;

        List<String> keywords = new ArrayList<>();
        if (lower.contains("projector") || lower.contains("projection")) {
            keywords.add("projector");
        }
        if (lower.contains("video conf") || lower.contains("video-conference") || lower.contains("videoconference")
                || lower.contains("vc") || lower.contains("zoom") || lower.contains("webcam")) {
            keywords.add("videoConference");
        }
        if (lower.contains("whiteboard") || lower.contains("white board") || lower.contains("flip chart") || lower.contains("flipchart")) {
            keywords.add("whiteboard");
        }

        RoomType roomType = detectRoomType(lower);
        String building = detectBuilding(lower);
        Integer floor = detectFloor(lower);
        String facilityId = null;

        return new ParsedQuery(attendees, capacity,
                keywords.contains("projector"),
                keywords.contains("videoConference"),
                keywords.contains("whiteboard"),
                roomType, building, floor, facilityId);
    }

    /**
     * Suggests the best available rooms for the requested date/time window,
     * ranked by a deterministic score. Only rooms that are actually bookable in
     * that window are returned.
     */
    public List<RoomSuggestion> suggestRooms(
            LocalDate date,
            LocalTime start,
            LocalTime end,
            ParsedQuery query,
            int limit) {

        LocalDateTime startDateTime = date.atTime(start);
        LocalDateTime endDateTime = date.atTime(end);
        Integer expected = query != null ? query.expectedAttendees() : null;

        List<Room> candidates = roomRepository.findByActiveTrue().stream()
                .filter(r -> query == null || query.roomType() == null || r.getType() == query.roomType())
                .filter(r -> query == null || query.building() == null
                        || (r.getBuilding() != null && r.getBuilding().equalsIgnoreCase(query.building())))
                .filter(r -> query == null || query.floor() == null
                        || (r.getFloorNumber() != null && r.getFloorNumber().equals(query.floor())))
                .filter(r -> query == null || query.facilityId() == null
                        || r.getFacility().getId().toString().equals(query.facilityId()))
                .filter(r -> expected == null || r.getCapacity() == null || r.getCapacity() >= expected)
                .collect(Collectors.toList());

        List<RoomSuggestion> suggestions = new ArrayList<>();
        for (Room room : candidates) {
            if (!isAvailable(room, startDateTime, endDateTime)) {
                continue;
            }
            int score = scoreRoom(room, startDateTime, endDateTime, expected, query);
            String reason = buildReason(room, expected, query);

            suggestions.add(new RoomSuggestion(
                    room.getId(),
                    room.getName(),
                    room.getRoomNumber(),
                    room.getFacility().getName(),
                    room.getBuilding(),
                    room.getFloorNumber(),
                    room.getCapacity(),
                    room.getType().name(),
                    score,
                    reason,
                    Boolean.TRUE.equals(room.getHasProjector()),
                    Boolean.TRUE.equals(room.getHasVideoConference()),
                    Boolean.TRUE.equals(room.getHasWhiteboard()),
                    room.getAmenities().stream().map(a -> a.getName()).collect(Collectors.toList())
            ));
        }

        suggestions.sort(Comparator.comparingInt(RoomSuggestion::score).reversed());
        return suggestions.stream().limit(Math.max(1, limit)).collect(Collectors.toList());
    }

    /**
     * Runs pre-submit policy and conflict checks against real data.
     */
    public List<PolicyWarning> validateReservation(
            Room room,
            LocalDateTime start,
            LocalDateTime end,
            Integer expectedAttendees) {

        List<PolicyWarning> warnings = new ArrayList<>();

        if (end == null || start == null || !end.isAfter(start)) {
            warnings.add(new PolicyWarning("INVALID_RANGE", "ERROR",
                    "End time must be after start time.", Map.of("start", start, "end", end)));
            return warnings;
        }
        if (start.isBefore(LocalDateTime.now())) {
            warnings.add(new PolicyWarning("PAST_TIME", "ERROR",
                    "Reservation cannot be in the past.", Map.of("start", start)));
        }

        if (room.getOpenTime() != null && room.getCloseTime() != null) {
            boolean withinHours = !start.toLocalTime().isBefore(room.getOpenTime())
                    && !end.toLocalTime().isAfter(room.getCloseTime());
            if (!withinHours) {
                warnings.add(new PolicyWarning("OUTSIDE_OPERATING_HOURS", "WARNING",
                        "Selected time is outside the room's operating hours ("
                                + room.getOpenTime() + " - " + room.getCloseTime() + ").",
                        Map.of("openTime", room.getOpenTime(), "closeTime", room.getCloseTime())));
            }
        }

        boolean maintenanceBlocked = room.getStatus() == com.photonicomega.facilities.module.facilities.domain.RoomStatus.MAINTENANCE
                || room.getStatus() == com.photonicomega.facilities.module.facilities.domain.RoomStatus.OUT_OF_SERVICE
                || !maintenanceScheduleRepository.findOverlappingMaintenance(room.getId(), start, end).isEmpty();
        if (maintenanceBlocked) {
            warnings.add(new PolicyWarning("MAINTENANCE", "ERROR",
                    "This room is under maintenance for the selected timeframe.",
                    Map.of("roomId", room.getId())));
        }

        List<com.photonicomega.facilities.module.facilities.domain.Reservation> conflicts =
                reservationRepository.findConflictingReservations(room.getId(), start, end);
        if (!conflicts.isEmpty()) {
            var conflict = conflicts.get(0);
            warnings.add(new PolicyWarning("CONFLICT", "ERROR",
                    "Room is already reserved for the selected timeframe ("
                            + conflict.getStartTime() + " - " + conflict.getEndTime() + ").",
                    Map.of("conflictingTitle", conflict.getTitle(),
                            "conflictingStart", conflict.getStartTime(),
                            "conflictingEnd", conflict.getEndTime(),
                            "conflictStatus", conflict.getStatus().name())));
        }

        if (expectedAttendees != null && room.getCapacity() != null) {
            if (expectedAttendees > room.getCapacity()) {
                warnings.add(new PolicyWarning("CAPACITY", "ERROR",
                        "Expected attendees (" + expectedAttendees + ") exceed room capacity (" + room.getCapacity() + ").",
                        Map.of("expectedAttendees", expectedAttendees, "capacity", room.getCapacity())));
            } else if (expectedAttendees <= room.getCapacity() * 0.4) {
                warnings.add(new PolicyWarning("CAPACITY", "INFO",
                        "Room is much larger than needed (" + room.getCapacity() + " seats for "
                                + expectedAttendees + " attendees). A smaller room may be a better fit.",
                        Map.of("expectedAttendees", expectedAttendees, "capacity", room.getCapacity())));
            }
        }

        if (expectedAttendees != null && expectedAttendees >= HIGH_CAPACITY_THRESHOLD) {
            warnings.add(new PolicyWarning("HIGH_CAPACITY", "WARNING",
                    "High-capacity booking (" + expectedAttendees + " attendees). This will be flagged for "
                            + "explicit Facilities Manager approval.",
                    Map.of("threshold", HIGH_CAPACITY_THRESHOLD, "expectedAttendees", expectedAttendees)));
        }

        if (isPeakHour(start)) {
            warnings.add(new PolicyWarning("PEAK_HOURS", "INFO",
                    "Requested start falls in peak booking hours ("
                            + PEAK_HOUR_START + ":00 - " + PEAK_HOUR_END + ":00). Availability may be limited.",
                    Map.of("peakStart", PEAK_HOUR_START, "peakEnd", PEAK_HOUR_END)));
        }

        return warnings;
    }

    /**
     * Finds alternative non-conflicting windows for the same room, scanning
     * forward in 30-minute increments from the requested end time.
     */
    public List<Map<String, Object>> findAlternativeSlots(Room room, LocalDateTime start, LocalDateTime end, int limit) {
        List<Map<String, Object>> alternatives = new ArrayList<>();
        long durationMinutes = java.time.Duration.between(start, end).toMinutes();
        LocalDateTime cursor = start;
        int attempts = 0;

        while (alternatives.size() < limit && attempts < 60) {
            attempts++;
            cursor = cursor.plusMinutes(30);
            if (cursor.toLocalDate().isAfter(start.toLocalDate())) {
                break;
            }
            LocalDateTime altStart = cursor;
            LocalDateTime altEnd = cursor.plusMinutes(durationMinutes);

            boolean ok = true;
            if (room.getOpenTime() != null && room.getCloseTime() != null) {
                boolean withinHours = !altStart.toLocalTime().isBefore(room.getOpenTime())
                        && !altEnd.toLocalTime().isAfter(room.getCloseTime());
                if (!withinHours) {
                    ok = false;
                }
            }
            if (ok && !maintenanceScheduleRepository.findOverlappingMaintenance(room.getId(), altStart, altEnd).isEmpty()) {
                ok = false;
            }
            if (ok && !reservationRepository.findConflictingReservations(room.getId(), altStart, altEnd).isEmpty()) {
                ok = false;
            }

            if (ok) {
                Map<String, Object> slot = new LinkedHashMap<>();
                slot.put("date", altStart.toLocalDate());
                slot.put("startTime", altStart.toLocalTime());
                slot.put("endTime", altEnd.toLocalTime());
                slot.put("startDateTime", altStart);
                slot.put("endDateTime", altEnd);
                alternatives.add(slot);
            }
        }
        return alternatives;
    }

    /**
     * Drafts a structured reservation from a natural language request.
     */
    public ParsedDraft parseDraft(String text) {
        if (text == null || text.isBlank()) {
            return new ParsedDraft("", "", null, null, null, null, null, null, null, null, null, null, List.of());
        }
        String lower = text.toLowerCase(Locale.ROOT);
        List<String> keywords = new ArrayList<>();

        ParsedQuery query = parseQuery(text);
        if (Boolean.TRUE.equals(query.requiresProjector())) keywords.add("projector");
        if (Boolean.TRUE.equals(query.requiresVideoConference())) keywords.add("video conference");
        if (Boolean.TRUE.equals(query.requiresWhiteboard())) keywords.add("whiteboard");

        String date = detectDate(lower);
        String[] times = detectTimeRange(lower);
        String title = detectTitle(text);
        String description = text.trim();

        return new ParsedDraft(
                title,
                description,
                date,
                times[0],
                times[1],
                query.expectedAttendees(),
                query.requestedCapacity(),
                query.requiresProjector(),
                query.requiresVideoConference(),
                query.requiresWhiteboard(),
                query.roomType() != null ? query.roomType().name() : null,
                query.building(),
                keywords
        );
    }

    // ------------------------------------------------------------------
    // Scoring & helpers
    // ------------------------------------------------------------------

    private boolean isAvailable(Room room, LocalDateTime start, LocalDateTime end) {
        if (room.getStatus() == com.photonicomega.facilities.module.facilities.domain.RoomStatus.MAINTENANCE
                || room.getStatus() == com.photonicomega.facilities.module.facilities.domain.RoomStatus.OUT_OF_SERVICE) {
            return false;
        }
        if (room.getOpenTime() != null && room.getCloseTime() != null) {
            boolean withinHours = !start.toLocalTime().isBefore(room.getOpenTime())
                    && !end.toLocalTime().isAfter(room.getCloseTime());
            if (!withinHours) {
                return false;
            }
        }
        if (!maintenanceScheduleRepository.findOverlappingMaintenance(room.getId(), start, end).isEmpty()) {
            return false;
        }
        return reservationRepository.findConflictingReservations(room.getId(), start, end).isEmpty();
    }

    private int scoreRoom(Room room, LocalDateTime start, LocalDateTime end, Integer expected, ParsedQuery query) {
        int score = 50;

        if (query != null) {
            boolean projectorReq = Boolean.TRUE.equals(query.requiresProjector());
            boolean vcReq = Boolean.TRUE.equals(query.requiresVideoConference());
            boolean wbReq = Boolean.TRUE.equals(query.requiresWhiteboard());

            if (projectorReq && Boolean.TRUE.equals(room.getHasProjector())) score += 15;
            if (vcReq && Boolean.TRUE.equals(room.getHasVideoConference())) score += 15;
            if (wbReq && Boolean.TRUE.equals(room.getHasWhiteboard())) score += 10;

            if (query.building() != null && room.getBuilding() != null
                    && room.getBuilding().equalsIgnoreCase(query.building())) {
                score += 8;
            }
            if (query.floor() != null && room.getFloorNumber() != null
                    && room.getFloorNumber().equals(query.floor())) {
                score += 6;
            }
            if (query.roomType() != null && room.getType() == query.roomType()) {
                score += 10;
            }
        }

        if (expected != null && room.getCapacity() != null) {
            double ratio = (double) room.getCapacity() / expected;
            if (ratio >= 1.0 && ratio <= 1.8) {
                score += 12;
            } else if (ratio > 1.8) {
                score -= 4;
            }
        }

        long futureBookings = reservationRepository.findByRoomId(room.getId()).stream()
                .filter(r -> r.getEndTime().isAfter(LocalDateTime.now()))
                .filter(r -> r.getStatus() != com.photonicomega.facilities.module.facilities.domain.ReservationStatus.CANCELLED
                        && r.getStatus() != com.photonicomega.facilities.module.facilities.domain.ReservationStatus.REJECTED)
                .count();
        score += Math.max(0, 10 - futureBookings);

        return score;
    }

    private String buildReason(Room room, Integer expected, ParsedQuery query) {
        List<String> reasons = new ArrayList<>();
        if (expected != null && room.getCapacity() != null && room.getCapacity() >= expected) {
            reasons.add("fits " + expected + " attendees (" + room.getCapacity() + " seats)");
        }
        if (query != null) {
            if (Boolean.TRUE.equals(query.requiresProjector()) && Boolean.TRUE.equals(room.getHasProjector())) {
                reasons.add("has projector");
            }
            if (Boolean.TRUE.equals(query.requiresVideoConference()) && Boolean.TRUE.equals(room.getHasVideoConference())) {
                reasons.add("has video conference");
            }
            if (Boolean.TRUE.equals(query.requiresWhiteboard()) && Boolean.TRUE.equals(room.getHasWhiteboard())) {
                reasons.add("has whiteboard");
            }
        }
        if (room.getBuilding() != null) {
            reasons.add("located in " + room.getBuilding());
        }
        return reasons.isEmpty() ? "Available for the requested slot" : String.join(", ", reasons);
    }

    private boolean isPeakHour(LocalDateTime start) {
        int hour = start.getHour();
        return hour >= PEAK_HOUR_START && hour < PEAK_HOUR_END;
    }

    // ------------------------------------------------------------------
    // Natural language parsing helpers
    // ------------------------------------------------------------------

    private static final Pattern COUNT_PATTERN = Pattern.compile("(\\d+)\\s*(?:people|persons|pax|attendees|guests|participants|seats)");
    private static final Pattern TIME_PATTERN = Pattern.compile("(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private Integer extractCount(String lower) {
        Matcher m = COUNT_PATTERN.matcher(lower);
        if (m.find()) {
            return Integer.parseInt(m.group(1));
        }
        return null;
    }

    private RoomType detectRoomType(String lower) {
        if (lower.contains("auditorium")) return RoomType.AUDITORIUM;
        if (lower.contains("boardroom") || lower.contains("board room")) return RoomType.EXECUTIVE_BOARDROOM;
        if (lower.contains("training") || lower.contains("workshop") || lower.contains("classroom")) return RoomType.TRAINING_ROOM;
        if (lower.contains("event hall") || lower.contains("function hall") || lower.contains("ballroom")) return RoomType.EVENT_HALL;
        if (lower.contains("workstation") || lower.contains("pod") || lower.contains("cubicle")) return RoomType.WORKSTATION_POD;
        if (lower.contains("meeting") || lower.contains("huddle")) return RoomType.MEETING_ROOM;
        if (lower.contains("conference") || lower.contains("conference room")) return RoomType.CONFERENCE_ROOM;
        return null;
    }

    private String detectBuilding(String lower) {
        List<String> buildings = roomRepository.findByActiveTrue().stream()
                .map(Room::getBuilding)
                .filter(b -> b != null && !b.isBlank())
                .distinct()
                .collect(Collectors.toList());
        for (String b : buildings) {
            if (lower.contains(b.toLowerCase(Locale.ROOT))) {
                return b;
            }
        }
        return null;
    }

    private Integer detectFloor(String lower) {
        Matcher m = Pattern.compile("floor\\s*(\\d+)").matcher(lower);
        if (m.find()) {
            return Integer.parseInt(m.group(1));
        }
        return null;
    }

    private String detectDate(String lower) {
        for (int i = 0; i < 14; i++) {
            LocalDate d = LocalDate.now().plusDays(i);
            String dayName = d.getDayOfWeek().name().toLowerCase(Locale.ROOT);
            if (lower.contains(dayName) || lower.contains(dayName.substring(0, 3))) {
                return d.toString();
            }
            if (lower.contains("today")) {
                return LocalDate.now().toString();
            }
            if (lower.contains("tomorrow")) {
                return LocalDate.now().plusDays(1).toString();
            }
        }
        return null;
    }

    private String[] detectTimeRange(String lower) {
        List<int[]> times = new ArrayList<>();
        Matcher m = TIME_PATTERN.matcher(lower);
        while (m.find()) {
            int hour = Integer.parseInt(m.group(1));
            int minute = m.group(2) != null ? Integer.parseInt(m.group(2)) : 0;
            boolean pm = m.group(3).toLowerCase(Locale.ROOT).startsWith("p");
            if (pm && hour < 12) hour += 12;
            if (!pm && hour == 12) hour = 0;
            times.add(new int[]{hour, minute});
        }
        if (times.size() >= 2) {
            int[] s = times.get(0);
            int[] e = times.get(1);
            return new String[]{
                    String.format("%02d:%02d", s[0], s[1]),
                    String.format("%02d:%02d", e[0], e[1])
            };
        }
        if (times.size() == 1) {
            int[] s = times.get(0);
            int endHour = s[0] + 2 > 23 ? 23 : s[0] + 2;
            return new String[]{
                    String.format("%02d:%02d", s[0], s[1]),
                    String.format("%02d:%02d", endHour, s[1])
            };
        }
        return new String[]{null, null};
    }

    private String detectTitle(String text) {
        int maxLen = 80;
        String cleaned = text.trim().replaceAll("\\s+", " ");
        if (cleaned.length() <= maxLen) {
            return cleaned.isEmpty() ? "Room Reservation" : cleaned;
        }
        return cleaned.substring(0, maxLen).trim() + "...";
    }
}
