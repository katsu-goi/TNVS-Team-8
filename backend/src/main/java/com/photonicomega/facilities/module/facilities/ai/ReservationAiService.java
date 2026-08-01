package com.photonicomega.facilities.module.facilities.ai;

import com.photonicomega.facilities.ai.AiStateManagementService;
import com.photonicomega.facilities.module.facilities.domain.Reservation;
import com.photonicomega.facilities.module.facilities.domain.ReservationStatus;
import com.photonicomega.facilities.module.facilities.domain.Room;
import com.photonicomega.facilities.module.facilities.repository.ReservationRepository;
import com.photonicomega.facilities.module.facilities.repository.RoomRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class ReservationAiService {

    private final ReservationSuggestionEngine engine;
    private final ReservationLlmGateway llmGateway;
    private final ReservationRepository reservationRepository;
    private final RoomRepository roomRepository;
    private final AiStateManagementService aiStateService;

    // ------------------------------------------------------------------
    // 1. Smart room suggestions (Facilities Officer)
    // ------------------------------------------------------------------

    public Map<String, Object> suggestRooms(String naturalLanguage, LocalDate date, LocalTime start, LocalTime end, Integer limit) {
        ReservationSuggestionEngine.ParsedQuery query = engine.parseQuery(naturalLanguage);
        List<ReservationSuggestionEngine.RoomSuggestion> suggestions =
                engine.suggestRooms(date, start, end, query, limit != null ? limit : 5);

        List<Map<String, Object>> items = suggestions.stream()
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("roomId", s.roomId());
                    m.put("roomName", s.roomName());
                    m.put("roomNumber", s.roomNumber());
                    m.put("facilityName", s.facilityName());
                    m.put("building", s.building());
                    m.put("floorNumber", s.floorNumber());
                    m.put("capacity", s.capacity());
                    m.put("roomType", s.roomType());
                    m.put("score", s.score());
                    m.put("matchReason", s.matchReason());
                    m.put("hasProjector", s.hasProjector());
                    m.put("hasVideoConference", s.hasVideoConference());
                    m.put("hasWhiteboard", s.hasWhiteboard());
                    m.put("amenities", s.amenities());
                    return m;
                }).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("query", naturalLanguage);
        result.put("parsedCriteria", toParsedQueryMap(query));
        result.put("date", date);
        result.put("startTime", start);
        result.put("endTime", end);
        result.put("suggestions", items);

        String aiSummary = llmGateway.enrich(
                "You are a facility reservation assistant. Given the parsed search criteria and ranked room "
                        + "suggestions, produce 1-2 concise sentences explaining the top recommendation.",
                "Query: " + naturalLanguage + "\nTop room: " + (items.isEmpty() ? "none" : items.get(0)),
                items.isEmpty() ? "No available rooms matched the requested slot."
                        : "Recommended top match: " + items.get(0).get("roomName") + " - " + items.get(0).get("matchReason") + ".");
        result.put("aiSummary", aiSummary);

        aiStateService.addLog("Facility Reservation Intelligence", "AI Reservation Assistant",
                "suggest_rooms", "SUCCESS", 45, 180, "Facilities Officer");
        return result;
    }

    // ------------------------------------------------------------------
    // 2. Natural-language reservation drafting (Facilities Officer)
    // ------------------------------------------------------------------

    public Map<String, Object> draftReservation(String text) {
        ReservationSuggestionEngine.ParsedDraft draft = engine.parseDraft(text);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("title", draft.title());
        result.put("description", draft.description());
        result.put("date", draft.date());
        result.put("startTime", draft.startTime());
        result.put("endTime", draft.endTime());
        result.put("expectedAttendees", draft.expectedAttendees());
        result.put("requestedCapacity", draft.requestedCapacity());
        result.put("requiresProjector", draft.requiresProjector());
        result.put("requiresVideoConference", draft.requiresVideoConference());
        result.put("requiresWhiteboard", draft.requiresWhiteboard());
        result.put("roomType", draft.roomType());
        result.put("building", draft.building());
        result.put("detectedKeywords", draft.detectedKeywords());
        result.put("aiSummary", llmGateway.enrich(
                "You are a reservation assistant. Summarize the parsed reservation draft fields in one sentence "
                        + "and note any missing critical fields (date, start time, end time).",
                String.valueOf(result),
                "Draft parsed" + (draft.date() == null ? " - missing date" : "")
                        + (draft.startTime() == null || draft.endTime() == null ? " - missing time range" : "") + "."));

        aiStateService.addLog("Facility Reservation Intelligence", "AI Reservation Assistant",
                "draft_reservation", "SUCCESS", 40, 150, "Facilities Officer");
        return result;
    }

    // ------------------------------------------------------------------
    // 3. Pre-submit validation + alternatives (Facilities Officer)
    // ------------------------------------------------------------------

    public Map<String, Object> validateReservation(UUID roomId, LocalDateTime start, LocalDateTime end, Integer expectedAttendees) {
        Room room = roomRepository.findById(roomId).orElse(null);
        if (room == null) {
            throw new IllegalArgumentException("Room not found: " + roomId);
        }

        List<ReservationSuggestionEngine.PolicyWarning> warnings =
                engine.validateReservation(room, start, end, expectedAttendees);

        boolean blocked = warnings.stream().anyMatch(w -> "ERROR".equals(w.severity()));
        List<Map<String, Object>> alternatives = blocked
                ? engine.findAlternativeSlots(room, start, end, 5)
                : List.of();

        List<Map<String, Object>> warningItems = warnings.stream()
                .map(w -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("code", w.code());
                    m.put("severity", w.severity());
                    m.put("message", w.message());
                    m.put("details", w.details());
                    return m;
                }).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("roomId", room.getId());
        result.put("roomName", room.getName());
        result.put("valid", !blocked);
        result.put("blocked", blocked);
        result.put("warnings", warningItems);
        result.put("alternatives", alternatives);
        result.put("aiSummary", llmGateway.enrich(
                "You are a reservation validator. Summarize the validation warnings in 1-2 concise sentences "
                        + "for a facilities officer.",
                "Warnings: " + warningItems,
                blocked ? "Reservation is blocked for this room/slot. Review the warnings or choose an alternative slot."
                        : "No blocking issues found for this reservation."));

        aiStateService.addLog("Facility Reservation Intelligence", "AI Reservation Assistant",
                "validate_reservation", "SUCCESS", 50, 200, "Facilities Officer");
        return result;
    }

    // ------------------------------------------------------------------
    // 4. Approval recommendation (Facilities Manager)
    // ------------------------------------------------------------------

    public Map<String, Object> suggestApproval(UUID reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId).orElse(null);
        if (reservation == null) {
            throw new IllegalArgumentException("Reservation not found: " + reservationId);
        }

        List<Map<String, Object>> reasons = new ArrayList<>();
        int score = 50;

        Room room = reservation.getRoom();
        LocalDateTime start = reservation.getStartTime();
        LocalDateTime end = reservation.getEndTime();

        if (reservation.getStatus() != ReservationStatus.PENDING) {
            reasons.add(factor("INFO", "STATUS", "Reservation is " + reservation.getStatus().name().toLowerCase()
                    + ", not pending review.", Map.of("status", reservation.getStatus().name())));
        }

        List<Reservation> conflicts = reservationRepository.findConflictingReservations(room.getId(), start, end).stream()
                .filter(c -> !c.getId().equals(reservation.getId()))
                .filter(c -> c.getStatus() == ReservationStatus.APPROVED)
                .collect(Collectors.toList());
        if (!conflicts.isEmpty()) {
            score -= 40;
            reasons.add(factor("ERROR", "CONFLICT",
                    "Another reservation was already approved for this room in the same timeframe.",
                    Map.of("conflictingId", conflicts.get(0).getId(),
                            "conflictingStart", conflicts.get(0).getStartTime(),
                            "conflictingEnd", conflicts.get(0).getEndTime())));
        }

        if (room.getOpenTime() != null && room.getCloseTime() != null
                && (!start.toLocalTime().isBefore(room.getOpenTime()) && !end.toLocalTime().isAfter(room.getCloseTime()))) {
            score += 5;
            reasons.add(factor("POSITIVE", "OPERATING_HOURS",
                    "Request is within the room's operating hours (" + room.getOpenTime() + " - " + room.getCloseTime() + ").",
                    Map.of()));
        } else if (room.getOpenTime() != null && room.getCloseTime() != null) {
            score -= 10;
            reasons.add(factor("WARNING", "OPERATING_HOURS",
                    "Request falls outside the room's operating hours.",
                    Map.of("openTime", room.getOpenTime(), "closeTime", room.getCloseTime())));
        }

        boolean maintenanceBlocked = room.getStatus() == com.photonicomega.facilities.module.facilities.domain.RoomStatus.MAINTENANCE
                || room.getStatus() == com.photonicomega.facilities.module.facilities.domain.RoomStatus.OUT_OF_SERVICE;
        if (maintenanceBlocked) {
            score -= 40;
            reasons.add(factor("ERROR", "MAINTENANCE",
                    "Room is currently " + room.getStatus().name().toLowerCase() + ".",
                    Map.of("roomStatus", room.getStatus().name())));
        }

        Integer attendees = reservation.getExpectedAttendees();
        if (attendees != null && room.getCapacity() != null) {
            if (attendees > room.getCapacity()) {
                score -= 30;
                reasons.add(factor("ERROR", "CAPACITY",
                        "Expected attendees (" + attendees + ") exceed room capacity (" + room.getCapacity() + ").",
                        Map.of("expectedAttendees", attendees, "capacity", room.getCapacity())));
            } else if (attendees <= room.getCapacity() * 0.4) {
                reasons.add(factor("INFO", "CAPACITY",
                        "Room capacity (" + room.getCapacity() + ") is much larger than the expected attendance (" + attendees + ").",
                        Map.of("expectedAttendees", attendees, "capacity", room.getCapacity())));
            } else {
                score += 8;
                reasons.add(factor("POSITIVE", "CAPACITY",
                        "Room capacity comfortably accommodates " + attendees + " attendees.",
                        Map.of("expectedAttendees", attendees, "capacity", room.getCapacity())));
            }
        }

        if (attendees != null && attendees >= ReservationSuggestionEngine.HIGH_CAPACITY_THRESHOLD) {
            score -= 5;
            reasons.add(factor("WARNING", "HIGH_CAPACITY",
                    "High-capacity booking of " + attendees + " attendees - requires explicit manager sign-off.",
                    Map.of("threshold", ReservationSuggestionEngine.HIGH_CAPACITY_THRESHOLD)));
        }

        long durationHours = Duration.between(start, end).toHours();
        if (durationHours > 6) {
            reasons.add(factor("INFO", "DURATION",
                    "Long-duration booking (" + durationHours + "h) - confirm the resource is needed for the full window.",
                    Map.of("durationHours", durationHours)));
        }

        if (reservation.getReservedBy() != null) {
            long requesterApprovals = reservationRepository.findByReservedById(reservation.getReservedBy().getId()).stream()
                    .filter(r -> r.getStatus() == ReservationStatus.APPROVED)
                    .count();
            long requesterCancellations = reservationRepository.findByReservedById(reservation.getReservedBy().getId()).stream()
                    .filter(r -> r.getStatus() == ReservationStatus.CANCELLED)
                    .count();
            if (requesterApprovals > 0) {
                score += 3;
                reasons.add(factor("POSITIVE", "REQUESTER_HISTORY",
                        "Requester has " + requesterApprovals + " previously approved booking(s).",
                        Map.of("approvedCount", requesterApprovals)));
            }
            if (requesterCancellations > 3) {
                score -= 3;
                reasons.add(factor("INFO", "REQUESTER_HISTORY",
                        "Requester has a high cancellation count (" + requesterCancellations + ").",
                        Map.of("cancelledCount", requesterCancellations)));
            }
        }

        String recommendation;
        if (score < 50) {
            recommendation = "REJECT";
        } else if (score >= 75) {
            recommendation = "APPROVE";
        } else {
            recommendation = "REVIEW";
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reservationId", reservation.getId());
        result.put("title", reservation.getTitle());
        result.put("roomName", room.getName());
        result.put("recommendation", recommendation);
        result.put("score", Math.max(0, Math.min(100, score)));
        result.put("confidence", Math.min(98, 60 + Math.abs(score - 65) / 2));
        result.put("reasons", reasons);
        result.put("aiSummary", llmGateway.enrich(
                "You are a facilities manager assistant. Based on the recommendation and scoring factors, "
                        + "produce one concise sentence justifying the recommendation for the manager.",
                "Recommendation: " + recommendation + ", score " + score + ", factors: " + reasons,
                switch (recommendation) {
                    case "APPROVE" -> "Recommended for approval - all operational and policy checks pass.";
                    case "REJECT" -> "Recommended for rejection - blocking issues were found.";
                    default -> "Recommended for manual review - no hard conflicts, but proceed with caution.";
                }));

        aiStateService.addLog("Facility Reservation Intelligence", "AI Reservation Assistant",
                "suggest_approval", "SUCCESS", 55, 220, "Facilities Manager");
        return result;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private Map<String, Object> toParsedQueryMap(ReservationSuggestionEngine.ParsedQuery q) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("expectedAttendees", q.expectedAttendees());
        m.put("requestedCapacity", q.requestedCapacity());
        m.put("requiresProjector", q.requiresProjector());
        m.put("requiresVideoConference", q.requiresVideoConference());
        m.put("requiresWhiteboard", q.requiresWhiteboard());
        m.put("roomType", q.roomType() != null ? q.roomType().name() : null);
        m.put("building", q.building());
        m.put("floor", q.floor());
        m.put("facilityId", q.facilityId());
        return m;
    }

    private Map<String, Object> factor(String kind, String code, String message, Map<String, Object> details) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("kind", kind);
        m.put("code", code);
        m.put("message", message);
        m.put("details", details);
        return m;
    }

    public static LocalDateTime parseDateTime(String value) {
        try {
            return LocalDateTime.parse(value);
        } catch (DateTimeParseException e) {
            return LocalDate.parse(value).atTime(LocalTime.MIN);
        }
    }
}
