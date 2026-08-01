package com.photonicomega.facilities.module.employee.service;

import com.photonicomega.facilities.exception.BusinessRuleViolationException;
import com.photonicomega.facilities.exception.ResourceNotFoundException;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.auth.service.AuditService;
import com.photonicomega.facilities.module.documents.domain.ClassificationLevel;
import com.photonicomega.facilities.module.documents.domain.Document;
import com.photonicomega.facilities.module.documents.domain.DocumentStatus;
import com.photonicomega.facilities.module.documents.repository.DocumentRepository;
import com.photonicomega.facilities.module.employee.domain.*;
import com.photonicomega.facilities.module.employee.repository.EmployeeNotificationRepository;
import com.photonicomega.facilities.module.employee.repository.EmployeeRequestRepository;
import com.photonicomega.facilities.module.facilities.domain.Reservation;
import com.photonicomega.facilities.module.facilities.domain.ReservationStatus;
import com.photonicomega.facilities.module.facilities.domain.Room;
import com.photonicomega.facilities.module.facilities.domain.RoomStatus;
import com.photonicomega.facilities.module.facilities.domain.RoomType;
import com.photonicomega.facilities.module.facilities.repository.MaintenanceScheduleRepository;
import com.photonicomega.facilities.module.facilities.repository.ReservationRepository;
import com.photonicomega.facilities.module.facilities.repository.RoomRepository;
import com.photonicomega.facilities.module.facilities.service.RoomAvailabilityService;
import com.photonicomega.facilities.module.visitor.domain.Visitor;
import com.photonicomega.facilities.module.visitor.domain.VisitorStatus;
import com.photonicomega.facilities.module.visitor.repository.VisitorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Business logic for the self-service Employee / Requester role. Every method
 * is strictly scoped to the current {@link User}: lists return only the user's
 * own records, and updates/cancels are ownership-checked and gated on
 * pre-approval status. All mutations are recorded via {@link AuditService}.
 * DTO mapping is done here (inside the service transaction) so lazy
 * associations are safe under {@code open-in-view: false}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmployeeService {

    private static final String MODULE = "EMPLOYEE";

    private final ReservationRepository reservationRepository;
    private final RoomRepository roomRepository;
    private final MaintenanceScheduleRepository maintenanceScheduleRepository;
    private final RoomAvailabilityService roomAvailabilityService;
    private final VisitorRepository visitorRepository;
    private final DocumentRepository documentRepository;
    private final EmployeeRequestRepository employeeRequestRepository;
    private final EmployeeNotificationRepository employeeNotificationRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;

    // --- Dashboard ---

    @Transactional(readOnly = true)
    public Map<String, Object> dashboardSummary(User user) {
        UUID uid = user.getId();
        List<Reservation> reservations = reservationRepository.findByReservedById(uid);
        List<EmployeeRequest> requests =
                employeeRequestRepository.findByRequesterIdAndDeletedFalseOrderByCreatedAtDesc(uid);

        long pendingReservations = reservations.stream()
                .filter(r -> r.getStatus() == ReservationStatus.PENDING).count();
        long approvedReservations = reservations.stream()
                .filter(r -> r.getStatus() == ReservationStatus.APPROVED).count();
        long rejectedReservations = reservations.stream()
                .filter(r -> r.getStatus() == ReservationStatus.REJECTED).count();

        long pendingRequests = requests.stream()
                .filter(r -> r.getStatus() == RequestStatus.PENDING || r.getStatus() == RequestStatus.IN_REVIEW)
                .count();
        long approvedRequests = requests.stream()
                .filter(r -> r.getStatus() == RequestStatus.APPROVED).count();
        long rejectedRequests = requests.stream()
                .filter(r -> r.getStatus() == RequestStatus.REJECTED).count();

        LocalDateTime now = LocalDateTime.now();
        List<Reservation> upcoming = reservations.stream()
                .filter(r -> r.getStartTime() != null && r.getStartTime().isAfter(now))
                .filter(r -> r.getStatus() == ReservationStatus.PENDING || r.getStatus() == ReservationStatus.APPROVED)
                .sorted(Comparator.comparing(Reservation::getStartTime))
                .collect(Collectors.toList());

        long unreadNotifications = employeeNotificationRepository
                .countByRecipientIdAndReadFalseAndDeletedFalse(uid);

        // "Active Requests" = anything of the user's still in flight (reservations + requests awaiting outcome).
        long activeRequests = pendingReservations + pendingRequests;
        long pendingApprovals = pendingReservations + pendingRequests;
        long approved = approvedReservations + approvedRequests;
        long rejected = rejectedReservations + rejectedRequests;

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("activeRequests", activeRequests);
        summary.put("pendingApprovals", pendingApprovals);
        summary.put("approvedRequests", approved);
        summary.put("rejectedRequests", rejected);
        summary.put("upcomingReservations", (long) upcoming.size());
        summary.put("notifications", unreadNotifications);

        summary.put("upcomingReservationsList", upcoming.stream().limit(5)
                .map(this::toReservationDto).collect(Collectors.toList()));

        List<Map<String, Object>> recentRequests = requests.stream().limit(5)
                .map(this::toRequestDto).collect(Collectors.toList());
        summary.put("recentRequests", recentRequests);

        summary.put("recentNotifications", employeeNotificationRepository
                .findByRecipientIdAndDeletedFalseOrderByCreatedAtDesc(uid).stream().limit(5)
                .map(this::toNotificationDto).collect(Collectors.toList()));
        return summary;
    }

    // --- Reservations ---

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listReservations(User user) {
        return reservationRepository.findByReservedById(user.getId()).stream()
                .sorted(Comparator.comparing(Reservation::getCreatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toReservationDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> roomsAvailable(Map<String, Object> request) {
        LocalDate date = LocalDate.parse((String) request.get("date"));
        LocalTime start = LocalTime.parse((String) request.get("startTime"));
        LocalTime end = LocalTime.parse((String) request.get("endTime"));
        return roomAvailabilityService.findAvailableRooms(
                date, start, end,
                (String) request.get("facilityId"),
                (String) request.get("facilityType"),
                (String) request.get("building"),
                request.get("floor") != null ? Integer.parseInt(String.valueOf(request.get("floor"))) : null,
                request.get("minCapacity") != null ? Integer.parseInt(String.valueOf(request.get("minCapacity"))) : null,
                request.get("roomType") != null ? RoomType.valueOf((String) request.get("roomType")) : null,
                (String) request.get("availability"));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> roomFilters() {
        return roomAvailabilityService.getFilterOptions();
    }

    @Transactional
    public Map<String, Object> createReservation(Map<String, Object> request, User user) {
        UUID roomId;
        try {
            roomId = UUID.fromString((String) request.get("roomId"));
        } catch (Exception e) {
            throw new BusinessRuleViolationException("A valid roomId is required.");
        }
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new ResourceNotFoundException("Room", "id", roomId));
        if (!Boolean.TRUE.equals(room.getActive())) {
            throw new BusinessRuleViolationException("This room is not active and cannot be reserved.");
        }

        LocalDateTime start = LocalDateTime.parse((String) request.get("startTime"));
        LocalDateTime end = LocalDateTime.parse((String) request.get("endTime"));
        if (!end.isAfter(start)) {
            throw new BusinessRuleViolationException("End time must be after start time.");
        }
        if (start.isBefore(LocalDateTime.now())) {
            throw new BusinessRuleViolationException("Reservation cannot be in the past.");
        }

        if (room.getOpenTime() != null && room.getCloseTime() != null) {
            boolean withinHours = !start.toLocalTime().isBefore(room.getOpenTime())
                    && !end.toLocalTime().isAfter(room.getCloseTime());
            if (!withinHours) {
                throw new BusinessRuleViolationException(
                        "Selected time is outside the room's operating hours ("
                                + room.getOpenTime() + " - " + room.getCloseTime() + ").");
            }
        }

        boolean maintenanceBlocked = room.getStatus() == RoomStatus.MAINTENANCE
                || room.getStatus() == RoomStatus.OUT_OF_SERVICE
                || !maintenanceScheduleRepository.findOverlappingMaintenance(room.getId(), start, end).isEmpty();
        if (maintenanceBlocked) {
            throw new BusinessRuleViolationException("This room is under maintenance for the selected timeframe.");
        }

        List<Reservation> conflicts = reservationRepository.findConflictingReservations(room.getId(), start, end);
        if (!conflicts.isEmpty()) {
            Reservation c = conflicts.get(0);
            throw new BusinessRuleViolationException(
                    "Room is already reserved for the selected timeframe ("
                            + c.getStartTime() + " - " + c.getEndTime() + ").");
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
        auditService.log(user, "CREATE_RESERVATION", MODULE, "Reservation", saved.getId().toString(),
                "Submitted reservation request: " + saved.getTitle(), null);
        return toReservationDto(saved);
    }

    @Transactional
    public Map<String, Object> updateReservation(UUID id, Map<String, Object> body, User user) {
        Reservation r = ownedReservation(id, user);
        if (r.getStatus() != ReservationStatus.PENDING) {
            throw new BusinessRuleViolationException(
                    "Only pending reservations can be modified before approval.");
        }
        if (body.containsKey("title") && str(body.get("title")) != null) r.setTitle(str(body.get("title")));
        if (body.containsKey("description")) r.setDescription(str(body.get("description")));
        if (body.containsKey("expectedAttendees")) {
            Object a = body.get("expectedAttendees");
            r.setExpectedAttendees(a != null ? Integer.parseInt(String.valueOf(a)) : null);
        }
        if (body.containsKey("startTime") && str(body.get("startTime")) != null)
            r.setStartTime(LocalDateTime.parse(str(body.get("startTime"))));
        if (body.containsKey("endTime") && str(body.get("endTime")) != null)
            r.setEndTime(LocalDateTime.parse(str(body.get("endTime"))));
        if (r.getEndTime() != null && r.getStartTime() != null && !r.getEndTime().isAfter(r.getStartTime())) {
            throw new BusinessRuleViolationException("End time must be after start time.");
        }
        Reservation saved = reservationRepository.save(r);
        auditService.log(user, "UPDATE_RESERVATION", MODULE, "Reservation", id.toString(),
                "Updated reservation request: " + saved.getTitle(), null);
        return toReservationDto(saved);
    }

    @Transactional
    public Map<String, Object> cancelReservation(UUID id, User user) {
        Reservation r = ownedReservation(id, user);
        if (r.getStatus() == ReservationStatus.APPROVED
                || r.getStatus() == ReservationStatus.CHECKED_IN
                || r.getStatus() == ReservationStatus.COMPLETED) {
            throw new BusinessRuleViolationException(
                    "A " + r.getStatus().name().toLowerCase() + " reservation cannot be cancelled.");
        }
        r.setStatus(ReservationStatus.CANCELLED);
        Reservation saved = reservationRepository.save(r);
        auditService.log(user, "CANCEL_RESERVATION", MODULE, "Reservation", id.toString(),
                "Cancelled reservation request: " + saved.getTitle(), null);
        return toReservationDto(saved);
    }

    private Reservation ownedReservation(UUID id, User user) {
        Reservation r = reservationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", "id", id));
        if (r.getReservedBy() == null || !r.getReservedBy().getId().equals(user.getId())) {
            // Do not leak existence of other users' records.
            throw new ResourceNotFoundException("Reservation", "id", id);
        }
        return r;
    }

    // --- Visitors ---

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listVisitors(User user) {
        return visitorRepository.findByHostId(user.getId()).stream()
                .sorted(Comparator.comparing(Visitor::getCreatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toVisitorDto).collect(Collectors.toList());
    }

    @Transactional
    public Map<String, Object> createVisitor(Map<String, Object> body, User user) {
        String fullName = str(body.get("fullName"));
        String email = str(body.get("email"));
        String purpose = str(body.get("purposeOfVisit"));
        String arrivalRaw = str(body.get("expectedArrival"));
        if (fullName == null || fullName.isBlank()) {
            throw new BusinessRuleViolationException("Visitor full name is required.");
        }
        if (email == null || email.isBlank()) {
            throw new BusinessRuleViolationException("Visitor email is required.");
        }
        if (purpose == null || purpose.isBlank()) {
            throw new BusinessRuleViolationException("Purpose of visit is required.");
        }
        if (arrivalRaw == null || arrivalRaw.isBlank()) {
            throw new BusinessRuleViolationException("Expected arrival is required.");
        }
        Visitor visitor = Visitor.builder()
                .fullName(fullName)
                .email(email)
                .phoneNumber(str(body.get("phoneNumber")))
                .company(str(body.get("company")))
                .idNumber(str(body.get("idNumber")))
                .host(user)
                .purposeOfVisit(purpose)
                .expectedArrival(LocalDateTime.parse(arrivalRaw))
                .status(VisitorStatus.REGISTERED)
                .qrCodeToken("VIS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase())
                .build();
        Visitor saved = visitorRepository.save(visitor);
        auditService.log(user, "REGISTER_VISITOR", MODULE, "Visitor", saved.getId().toString(),
                "Registered visitor: " + fullName, null);
        return toVisitorDto(saved);
    }

    @Transactional
    public Map<String, Object> updateVisitor(UUID id, Map<String, Object> body, User user) {
        Visitor v = ownedVisitor(id, user);
        if (v.getStatus() != VisitorStatus.REGISTERED) {
            throw new BusinessRuleViolationException(
                    "Only a registered visit can be modified before check-in.");
        }
        if (body.containsKey("fullName") && str(body.get("fullName")) != null) v.setFullName(str(body.get("fullName")));
        if (body.containsKey("email") && str(body.get("email")) != null) v.setEmail(str(body.get("email")));
        if (body.containsKey("phoneNumber")) v.setPhoneNumber(str(body.get("phoneNumber")));
        if (body.containsKey("company")) v.setCompany(str(body.get("company")));
        if (body.containsKey("idNumber")) v.setIdNumber(str(body.get("idNumber")));
        if (body.containsKey("purposeOfVisit") && str(body.get("purposeOfVisit")) != null)
            v.setPurposeOfVisit(str(body.get("purposeOfVisit")));
        if (body.containsKey("expectedArrival") && str(body.get("expectedArrival")) != null)
            v.setExpectedArrival(LocalDateTime.parse(str(body.get("expectedArrival"))));
        Visitor saved = visitorRepository.save(v);
        auditService.log(user, "UPDATE_VISITOR", MODULE, "Visitor", id.toString(),
                "Updated visitor: " + saved.getFullName(), null);
        return toVisitorDto(saved);
    }

    private Visitor ownedVisitor(UUID id, User user) {
        Visitor v = visitorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Visitor", "id", id));
        if (v.getHost() == null || !v.getHost().getId().equals(user.getId())) {
            throw new ResourceNotFoundException("Visitor", "id", id);
        }
        return v;
    }

    // --- Documents (Create + Read only) ---

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listDocuments(User user) {
        return documentRepository
                .findByCreatedByAndDeletedFalseOrderByCreatedAtDesc(user.getEmail()).stream()
                .map(this::toDocumentDto).collect(Collectors.toList());
    }

    @Transactional
    public Map<String, Object> createDocument(Map<String, Object> body, User user) {
        String title = str(body.get("title"));
        String fileName = str(body.get("fileName"));
        if (title == null || title.isBlank()) {
            throw new BusinessRuleViolationException("Document title is required.");
        }
        if (fileName == null || fileName.isBlank()) {
            throw new BusinessRuleViolationException("A file name is required.");
        }
        ClassificationLevel classification;
        try {
            classification = body.get("classificationLevel") != null
                    ? ClassificationLevel.valueOf(str(body.get("classificationLevel")).toUpperCase())
                    : ClassificationLevel.INTERNAL;
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid classification level: " + body.get("classificationLevel"));
        }
        Long fileSize = null;
        if (body.get("fileSize") != null) {
            try {
                fileSize = Long.parseLong(String.valueOf(body.get("fileSize")));
            } catch (NumberFormatException ignored) { /* leave null */ }
        }
        Document doc = Document.builder()
                .title(title)
                .fileName(fileName)
                .fileType(str(body.get("fileType")))
                .fileSize(fileSize)
                .classificationLevel(classification)
                .status(DocumentStatus.PENDING_REVIEW)
                .versionNumber(1)
                .build();
        Document saved = documentRepository.save(doc);
        auditService.log(user, "UPLOAD_DOCUMENT", MODULE, "Document", saved.getId().toString(),
                "Uploaded document: " + title, null);
        return toDocumentDto(saved);
    }

    // --- Contract / legal requests ---

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listRequests(User user) {
        return employeeRequestRepository
                .findByRequesterIdAndDeletedFalseOrderByCreatedAtDesc(user.getId()).stream()
                .map(this::toRequestDto).collect(Collectors.toList());
    }

    @Transactional
    public Map<String, Object> createRequest(Map<String, Object> body, User user) {
        String title = str(body.get("title"));
        if (title == null || title.isBlank()) {
            throw new BusinessRuleViolationException("Request title is required.");
        }
        RequestType type;
        try {
            type = body.get("type") != null
                    ? RequestType.valueOf(str(body.get("type")).toUpperCase())
                    : RequestType.CONTRACT;
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleViolationException("Invalid request type: " + body.get("type"));
        }
        EmployeeRequest request = EmployeeRequest.builder()
                .requester(user)
                .type(type)
                .title(title)
                .description(str(body.get("description")))
                .status(RequestStatus.PENDING)
                .build();
        EmployeeRequest saved = employeeRequestRepository.save(request);
        auditService.log(user, "SUBMIT_REQUEST", MODULE, "EmployeeRequest", saved.getId().toString(),
                "Submitted " + type + " request: " + title, null);
        notify(user, NotificationType.INFO, "Request submitted",
                "Your " + type.name().toLowerCase() + " request \"" + title + "\" was submitted and is pending review.",
                "EmployeeRequest", saved.getId().toString());
        return toRequestDto(saved);
    }

    @Transactional
    public Map<String, Object> cancelRequest(UUID id, User user) {
        EmployeeRequest r = employeeRequestRepository.findByIdAndRequesterId(id, user.getId())
                .orElseThrow(() -> new ResourceNotFoundException("EmployeeRequest", "id", id));
        if (r.getStatus() != RequestStatus.PENDING && r.getStatus() != RequestStatus.IN_REVIEW) {
            throw new BusinessRuleViolationException(
                    "Only pending or in-review requests can be cancelled.");
        }
        r.setStatus(RequestStatus.CANCELLED);
        EmployeeRequest saved = employeeRequestRepository.save(r);
        auditService.log(user, "CANCEL_REQUEST", MODULE, "EmployeeRequest", id.toString(),
                "Cancelled request: " + saved.getTitle(), null);
        return toRequestDto(saved);
    }

    // --- Notifications ---

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listNotifications(User user) {
        return employeeNotificationRepository
                .findByRecipientIdAndDeletedFalseOrderByCreatedAtDesc(user.getId()).stream()
                .map(this::toNotificationDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public long unreadCount(User user) {
        return employeeNotificationRepository.countByRecipientIdAndReadFalseAndDeletedFalse(user.getId());
    }

    @Transactional
    public Map<String, Object> markRead(UUID id, User user) {
        EmployeeNotification n = employeeNotificationRepository.findByIdAndRecipientId(id, user.getId())
                .orElseThrow(() -> new ResourceNotFoundException("EmployeeNotification", "id", id));
        n.setRead(true);
        return toNotificationDto(employeeNotificationRepository.save(n));
    }

    @Transactional
    public void markAllRead(User user) {
        List<EmployeeNotification> all = employeeNotificationRepository
                .findByRecipientIdAndDeletedFalseOrderByCreatedAtDesc(user.getId());
        all.forEach(n -> n.setRead(true));
        employeeNotificationRepository.saveAll(all);
    }

    @Transactional
    public void dismiss(UUID id, User user) {
        EmployeeNotification n = employeeNotificationRepository.findByIdAndRecipientId(id, user.getId())
                .orElseThrow(() -> new ResourceNotFoundException("EmployeeNotification", "id", id));
        n.softDelete(user.getEmail());
        employeeNotificationRepository.save(n);
    }

    /** Persists a per-user notification for the given recipient. */
    @Transactional
    public void notify(User recipient, NotificationType type, String title, String message,
                       String entityType, String entityId) {
        employeeNotificationRepository.save(EmployeeNotification.builder()
                .recipient(recipient)
                .type(type)
                .title(title)
                .message(message)
                .relatedEntityType(entityType)
                .relatedEntityId(entityId)
                .read(false)
                .build());
    }

    // --- Profile ---

    @Transactional(readOnly = true)
    public Map<String, Object> getProfile(User user) {
        return toProfileDto(user);
    }

    @Transactional
    public Map<String, Object> updateProfile(Map<String, Object> body, User user) {
        User u = userRepository.findById(user.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", user.getId()));
        if (body.containsKey("firstName") && str(body.get("firstName")) != null) u.setFirstName(str(body.get("firstName")));
        if (body.containsKey("lastName") && str(body.get("lastName")) != null) u.setLastName(str(body.get("lastName")));
        if (body.containsKey("phoneNumber")) u.setPhoneNumber(str(body.get("phoneNumber")));
        if (body.containsKey("department")) u.setDepartment(str(body.get("department")));
        if (body.containsKey("position")) u.setPosition(str(body.get("position")));
        if (body.containsKey("avatarUrl")) u.setAvatarUrl(str(body.get("avatarUrl")));
        User saved = userRepository.save(u);
        auditService.log(user, "UPDATE_PROFILE", MODULE, "User", saved.getId().toString(),
                "Updated own profile", null);
        return toProfileDto(saved);
    }

    // --- DTO mappers (lazy-safe; run inside the service transaction) ---

    private Map<String, Object> toReservationDto(Reservation r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("title", r.getTitle());
        m.put("description", r.getDescription());
        m.put("startTime", r.getStartTime());
        m.put("endTime", r.getEndTime());
        m.put("status", r.getStatus());
        m.put("expectedAttendees", r.getExpectedAttendees());
        m.put("rejectionReason", r.getRejectionReason());
        Room room = r.getRoom();
        if (room != null) {
            m.put("roomId", room.getId());
            m.put("roomName", room.getName());
            m.put("roomNumber", room.getRoomNumber());
            m.put("floorNumber", room.getFloorNumber());
            if (room.getFacility() != null) {
                m.put("facilityName", room.getFacility().getName());
                m.put("facilityCode", room.getFacility().getCode());
            }
        }
        m.put("createdAt", r.getCreatedAt());
        return m;
    }

    private Map<String, Object> toVisitorDto(Visitor v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", v.getId());
        m.put("fullName", v.getFullName());
        m.put("email", v.getEmail());
        m.put("phoneNumber", v.getPhoneNumber());
        m.put("company", v.getCompany());
        m.put("idNumber", v.getIdNumber());
        m.put("purposeOfVisit", v.getPurposeOfVisit());
        m.put("expectedArrival", v.getExpectedArrival());
        m.put("actualArrival", v.getActualArrival());
        m.put("actualDeparture", v.getActualDeparture());
        m.put("status", v.getStatus());
        m.put("badgeNumber", v.getBadgeNumber());
        m.put("createdAt", v.getCreatedAt());
        return m;
    }

    private Map<String, Object> toDocumentDto(Document d) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", d.getId());
        m.put("title", d.getTitle());
        m.put("fileName", d.getFileName());
        m.put("fileType", d.getFileType());
        m.put("fileSize", d.getFileSize());
        m.put("status", d.getStatus());
        m.put("classificationLevel", d.getClassificationLevel());
        m.put("supabaseStorageUrl", d.getSupabaseStorageUrl());
        m.put("versionNumber", d.getVersionNumber());
        m.put("createdAt", d.getCreatedAt());
        return m;
    }

    private Map<String, Object> toRequestDto(EmployeeRequest r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("type", r.getType());
        m.put("title", r.getTitle());
        m.put("description", r.getDescription());
        m.put("status", r.getStatus());
        m.put("decisionNotes", r.getDecisionNotes());
        m.put("createdAt", r.getCreatedAt());
        m.put("updatedAt", r.getUpdatedAt());
        return m;
    }

    private Map<String, Object> toNotificationDto(EmployeeNotification n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", n.getId());
        m.put("title", n.getTitle());
        m.put("message", n.getMessage());
        m.put("type", n.getType());
        m.put("read", n.isRead());
        m.put("relatedEntityType", n.getRelatedEntityType());
        m.put("relatedEntityId", n.getRelatedEntityId());
        m.put("createdAt", n.getCreatedAt());
        return m;
    }

    private Map<String, Object> toProfileDto(User u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("firstName", u.getFirstName());
        m.put("lastName", u.getLastName());
        m.put("fullName", u.getFullName());
        m.put("email", u.getEmail());
        m.put("phoneNumber", u.getPhoneNumber());
        m.put("employeeId", u.getEmployeeId());
        m.put("department", u.getDepartment());
        m.put("position", u.getPosition());
        m.put("status", u.getStatus());
        return m;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
