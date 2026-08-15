package com.photonicomega.facilities.module.admin.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.admin.domain.AdminNotification;
import com.photonicomega.facilities.module.admin.repository.AdminNotificationRepository;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/admin/notifications")
@RequiredArgsConstructor
@Tag(name = "Admin Notifications", description = "System-wide administrator notifications")
public class NotificationController {

    private final AdminNotificationRepository repository;
    private final UserRepository userRepository;

    @GetMapping
    @Operation(summary = "Get notifications visible to the current admin (most recent first)")
    public ResponseEntity<ApiResponse<List<AdminNotification>>> getAll(
            @AuthenticationPrincipal UserDetails userDetails) {
        User admin = resolveAdmin(userDetails);
        return ResponseEntity.ok(ApiResponse.success(repository.findVisible(admin.getId())));
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Get count of unread notifications for the current admin")
    public ResponseEntity<ApiResponse<Long>> getUnreadCount(
            @AuthenticationPrincipal UserDetails userDetails) {
        User admin = resolveAdmin(userDetails);
        return ResponseEntity.ok(ApiResponse.success(repository.countUnread(admin.getId())));
    }

    @PutMapping("/{id}/read")
    @Operation(summary = "Mark notification as read")
    public ResponseEntity<ApiResponse<Void>> markAsRead(
            @PathVariable String id, @AuthenticationPrincipal UserDetails userDetails) {
        User admin = resolveAdmin(userDetails);
        repository.findById(UUID.fromString(id)).ifPresent(n -> {
            if (n.getRecipient() == null || admin.getId().equals(n.getRecipient().getId())) {
                n.setRead(true);
                repository.save(n);
            }
        });
        return ResponseEntity.ok(ApiResponse.success(null, "Notification marked as read"));
    }

    private User resolveAdmin(UserDetails userDetails) {
        return userRepository.findByEmailAndDeletedFalse(userDetails.getUsername()).orElse(null);
    }
}