package com.photonicomega.facilities.module.notification.controller;

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
 * Role-agnostic notification endpoints available to <em>every</em> authenticated
 * user regardless of role. The path {@code /v1/notifications} is not matched by
 * any role-specific security rule, so it falls through to
 * {@code anyRequest().authenticated()} — meaning managers, officers, admins and
 * employees all reach it.
 *
 * <p>Backed by the same per-user {@code EmployeeNotification} store (keyed by
 * {@code recipient}), so read/unread state is real and strictly owner-scoped:
 * every operation resolves the current user and only touches their own rows.
 * All responses are DTO maps (never raw entities) to stay lazy-safe under
 * {@code open-in-view: false}.
 */
@RestController
@RequestMapping("/v1/notifications")
@RequiredArgsConstructor
@Tag(name = "Notifications", description = "Per-user notifications for all roles")
public class UserNotificationController {

    private final EmployeeService employeeService;
    private final UserRepository userRepository;

    @GetMapping
    @Operation(summary = "List the current user's notifications (most recent first)")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> list(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        return ResponseEntity.ok(ApiResponse.success(
                employeeService.listNotifications(user), "Notifications retrieved"));
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Count the current user's unread notifications")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Long>> unreadCount(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        return ResponseEntity.ok(ApiResponse.success(
                employeeService.unreadCount(user), "Unread count retrieved"));
    }

    @PostMapping("/{id}/read")
    @Operation(summary = "Mark one notification as read")
    public ResponseEntity<ApiResponse<Map<String, Object>>> markRead(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        return ResponseEntity.ok(ApiResponse.success(
                employeeService.markRead(id, user), "Notification marked as read"));
    }

    @PostMapping("/read-all")
    @Operation(summary = "Mark all of the current user's notifications as read")
    public ResponseEntity<ApiResponse<String>> markAllRead(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        employeeService.markAllRead(user);
        return ResponseEntity.ok(ApiResponse.success("All notifications marked as read"));
    }

    @PostMapping("/{id}/dismiss")
    @Operation(summary = "Dismiss (soft-delete) a notification")
    public ResponseEntity<ApiResponse<String>> dismiss(
            @PathVariable UUID id, @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        employeeService.dismiss(id, user);
        return ResponseEntity.ok(ApiResponse.success("Notification dismissed"));
    }

    private User resolveUser(UserDetails userDetails) {
        if (userDetails == null) return null;
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }
}
