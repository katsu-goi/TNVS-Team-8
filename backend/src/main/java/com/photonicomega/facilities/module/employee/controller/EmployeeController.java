package com.photonicomega.facilities.module.employee.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.employee.service.EmployeeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Employee / Requester endpoints: strictly owner-scoped self-service
 * operations. Every list is filtered to the current user, and updates/cancels
 * are only allowed on the user's own records before approval. All endpoints
 * return DTO maps (never raw entities) to stay lazy-safe under
 * {@code open-in-view: false}.
 */
@RestController
@RequestMapping("/v1/employee")
@RequiredArgsConstructor
@Tag(name = "Employee", description = "Self-service facilities, visitor, document, and request endpoints")
public class EmployeeController {

    private final EmployeeService employeeService;
    private final UserRepository userRepository;

    // --- Dashboard ---

    @GetMapping("/dashboard/summary")
    @Operation(summary = "Employee dashboard: own requests, reservations, notifications")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDashboardSummary(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> summary = employeeService.dashboardSummary(user);
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    // --- Reservations ---

    @GetMapping("/reservations")
    @Operation(summary = "List own reservations")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getReservations(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        List<Map<String, Object>> reservations = employeeService.listReservations(user);
        return ResponseEntity.ok(ApiResponse.success(reservations, "Reservations retrieved"));
    }

    @PostMapping("/reservations")
    @Operation(summary = "Create a reservation request (starts as PENDING)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createReservation(
            @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> reservation = employeeService.createReservation(body, user);
        return ResponseEntity.ok(ApiResponse.success(reservation, "Reservation request submitted"));
    }

    @PutMapping("/reservations/{id}")
    @Operation(summary = "Update own pending reservation")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateReservation(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> reservation = employeeService.updateReservation(id, body, user);
        return ResponseEntity.ok(ApiResponse.success(reservation, "Reservation updated"));
    }

    @PostMapping("/reservations/{id}/cancel")
    @Operation(summary = "Cancel own reservation")
    public ResponseEntity<ApiResponse<Map<String, Object>>> cancelReservation(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> reservation = employeeService.cancelReservation(id, user);
        return ResponseEntity.ok(ApiResponse.success(reservation, "Reservation cancelled"));
    }

    @PostMapping("/rooms/available")
    @Operation(summary = "Search available rooms for a time slot")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> roomsAvailable(
            @RequestBody Map<String, Object> request) {
        Map<String, Object> result = employeeService.roomsAvailable(request);
        return ResponseEntity.ok(ApiResponse.success(result, "Available rooms retrieved"));
    }

    @GetMapping("/rooms/filters")
    @Operation(summary = "Get room filter options (facilities, types, buildings, floors)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> roomFilters() {
        Map<String, Object> filters = employeeService.roomFilters();
        return ResponseEntity.ok(ApiResponse.success(filters, "Room filters retrieved"));
    }

    // --- Visitors ---

    @GetMapping("/visitors")
    @Operation(summary = "List own visitors")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getVisitors(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        List<Map<String, Object>> visitors = employeeService.listVisitors(user);
        return ResponseEntity.ok(ApiResponse.success(visitors, "Visitors retrieved"));
    }

    @PostMapping("/visitors")
    @Operation(summary = "Register a visitor (sets current user as host)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createVisitor(
            @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> visitor = employeeService.createVisitor(body, user);
        return ResponseEntity.ok(ApiResponse.success(visitor, "Visitor registered"));
    }

    @PutMapping("/visitors/{id}")
    @Operation(summary = "Update own visitor before check-in")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateVisitor(
            @PathVariable UUID id, @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> visitor = employeeService.updateVisitor(id, body, user);
        return ResponseEntity.ok(ApiResponse.success(visitor, "Visitor updated"));
    }

    // --- Documents ---

    @GetMapping("/documents")
    @Operation(summary = "List own documents")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getDocuments(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        List<Map<String, Object>> documents = employeeService.listDocuments(user);
        return ResponseEntity.ok(ApiResponse.success(documents, "Documents retrieved"));
    }

    @PostMapping("/documents")
    @Operation(summary = "Upload document metadata (file upload handled separately)")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createDocument(
            @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> document = employeeService.createDocument(body, user);
        return ResponseEntity.ok(ApiResponse.success(document, "Document uploaded"));
    }

    // --- Contract / Legal requests ---

    @GetMapping("/requests")
    @Operation(summary = "List own contract/legal requests")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getRequests(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        List<Map<String, Object>> requests = employeeService.listRequests(user);
        return ResponseEntity.ok(ApiResponse.success(requests, "Requests retrieved"));
    }

    @PostMapping("/requests")
    @Operation(summary = "Submit a contract or legal request")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRequest(
            @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> request = employeeService.createRequest(body, user);
        return ResponseEntity.ok(ApiResponse.success(request, "Request submitted"));
    }

    @PostMapping("/requests/{id}/cancel")
    @Operation(summary = "Cancel own pending/in-review request")
    public ResponseEntity<ApiResponse<Map<String, Object>>> cancelRequest(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> request = employeeService.cancelRequest(id, user);
        return ResponseEntity.ok(ApiResponse.success(request, "Request cancelled"));
    }

    // --- Notifications ---

    @GetMapping("/notifications")
    @Operation(summary = "List own notifications")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getNotifications(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        List<Map<String, Object>> notifications = employeeService.listNotifications(user);
        return ResponseEntity.ok(ApiResponse.success(notifications, "Notifications retrieved"));
    }

    @GetMapping("/notifications/unread-count")
    @Operation(summary = "Count unread notifications")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Long>> getUnreadCount(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        long count = employeeService.unreadCount(user);
        return ResponseEntity.ok(ApiResponse.success(count, "Unread count retrieved"));
    }

    @PostMapping("/notifications/{id}/read")
    @Operation(summary = "Mark one notification as read")
    public ResponseEntity<ApiResponse<Map<String, Object>>> markRead(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> notification = employeeService.markRead(id, user);
        return ResponseEntity.ok(ApiResponse.success(notification, "Notification marked as read"));
    }

    @PostMapping("/notifications/read-all")
    @Operation(summary = "Mark all notifications as read")
    public ResponseEntity<ApiResponse<String>> markAllRead(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        employeeService.markAllRead(user);
        return ResponseEntity.ok(ApiResponse.success("All notifications marked as read"));
    }

    @PostMapping("/notifications/{id}/dismiss")
    @Operation(summary = "Dismiss (soft-delete) a notification")
    public ResponseEntity<ApiResponse<String>> dismissNotification(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        employeeService.dismiss(id, user);
        return ResponseEntity.ok(ApiResponse.success("Notification dismissed"));
    }

    // --- Profile ---

    @GetMapping("/profile")
    @Operation(summary = "Get own profile")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getProfile(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> profile = employeeService.getProfile(user);
        return ResponseEntity.ok(ApiResponse.success(profile, "Profile retrieved"));
    }

    @PutMapping("/profile")
    @Operation(summary = "Update own profile")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateProfile(
            @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        Map<String, Object> profile = employeeService.updateProfile(body, user);
        return ResponseEntity.ok(ApiResponse.success(profile, "Profile updated"));
    }

    // --- Helper ---

    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) return null;
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }
}
