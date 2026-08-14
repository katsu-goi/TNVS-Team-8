package com.photonicomega.facilities.module.monitoring.controller;

import com.photonicomega.facilities.common.dto.ApiResponse;
import com.photonicomega.facilities.module.monitoring.dto.SubsystemHealthSnapshot.Snapshot;
import com.photonicomega.facilities.module.monitoring.dto.SubsystemHealthSnapshot.SubsystemHealth;
import com.photonicomega.facilities.module.monitoring.service.SubsystemHealthMonitorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/admin/system-monitoring")
@RequiredArgsConstructor
@Tag(name = "System Subsystem Health Monitoring", description = "Real-time health and availability telemetry for the six subsystems.")
public class SystemMonitoringController {

    private final SubsystemHealthMonitorService monitorService;

    @GetMapping("/subsystems")
    @Operation(summary = "Get the latest consolidated subsystem health snapshot")
    public ResponseEntity<ApiResponse<Snapshot>> getSubsystemHealth() {
        return ResponseEntity.ok(ApiResponse.success(monitorService.getLatestSnapshot()));
    }

    @GetMapping("/subsystems/{subsystemId}")
    @Operation(summary = "Get the latest health detail for a single subsystem")
    public ResponseEntity<ApiResponse<SubsystemHealth>> getSubsystemDetail(@PathVariable String subsystemId) {
        Snapshot snapshot = monitorService.getLatestSnapshot();
        SubsystemHealth subsystem = snapshot.getSubsystems().stream()
                .filter(sh -> sh.getId().equalsIgnoreCase(subsystemId) || sh.getKey().equalsIgnoreCase(subsystemId))
                .findFirst()
                .orElse(null);
        if (subsystem == null) {
            return ResponseEntity.ok(ApiResponse.success(null, "Subsystem not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(subsystem));
    }
}