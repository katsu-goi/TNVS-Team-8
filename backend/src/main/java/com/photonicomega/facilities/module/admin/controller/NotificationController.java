package com.photonicomega.facilities.module.admin.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.admin.domain.AdminNotification;
import com.photonicomega.facilities.module.admin.repository.AdminNotificationRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/admin/notifications")
@RequiredArgsConstructor
@Tag(name = "Admin Notifications", description = "System-wide administrator notifications")
public class NotificationController {

    private final AdminNotificationRepository repository;

    @GetMapping
    @Operation(summary = "Get all admin notifications (most recent first)")
    public ResponseEntity<ApiResponse<List<AdminNotification>>> getAll() {
        return ResponseEntity.ok(ApiResponse.success(repository.findAllByOrderByCreatedAtDesc()));
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Get count of unread notifications")
    public ResponseEntity<ApiResponse<Long>> getUnreadCount() {
        return ResponseEntity.ok(ApiResponse.success(repository.countByReadFalse()));
    }

    @PutMapping("/{id}/read")
    @Operation(summary = "Mark notification as read")
    public ResponseEntity<ApiResponse<Void>> markAsRead(@PathVariable String id) {
        repository.findById(java.util.UUID.fromString(id)).ifPresent(n -> {
            n.setRead(true);
            repository.save(n);
        });
        return ResponseEntity.ok(ApiResponse.success(null, "Notification marked as read"));
    }
}
